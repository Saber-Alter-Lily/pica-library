package com.picalibrary.android;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.*;

/** Long-running, resumable Pica download. Only indexed complete pages are trusted on resume. */
public final class PicaDownloadWorker extends Worker {
    static final String KEY_COMIC="comicId",KEY_EPISODE="episodeId",KEY_DONE="done",KEY_TOTAL="total",KEY_PHASE="phase";
    static final String KEY_EPISODE_DONE="episodeDone",KEY_EPISODE_TOTAL="episodeTotal",KEY_PAGE_DONE="pageDone",KEY_PAGE_TOTAL="pageTotal",KEY_TITLE="title",KEY_EPISODE_TITLE="episodeTitle";
    private static final String CHANNEL="pica-downloads";
    public PicaDownloadWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    @NonNull @Override public Result doWork(){
        String comicId=getInputData().getString(KEY_COMIC),selected=getInputData().getString(KEY_EPISODE);if(comicId==null||comicId.isEmpty())return Result.failure();
        try{
            PicaClient client=new PicaClient(getApplicationContext());PicaClient.Comic online=client.comic(comicId);setForegroundAsync(foreground(comicId,online.title,"正在准备下载",0,0));List<PicaClient.Episode> episodes=client.episodes(comicId);if(selected!=null&&!selected.isEmpty())episodes.removeIf(e->!e.id.equals(selected));if(episodes.isEmpty())return failure("没有可下载章节");
            int episodeTotal=episodes.size(),episodeDone=0;
            for(PicaClient.Episode episode:episodes){if(isStopped())return Result.failure();List<PicaClient.Page> pages=client.pages(comicId,episode.order);List<PhoneDownloadStore.Page> stored=new ArrayList<>();int pageDone=0;publish(comicId,online.title,episode.title,episodeDone,episodeTotal,pageDone,pages.size(),"正在下载");
                for(PicaClient.Page page:pages){if(isStopped())return Result.failure();String prior=PhoneDownloadStore.indexedUri(getApplicationContext(),comicId,episode.id,page.position);String uri=prior.isEmpty()?download(client,comicId,episode,page):prior;stored.add(new PhoneDownloadStore.Page(page.position,uri));pageDone++;publish(comicId,online.title,episode.title,episodeDone,episodeTotal,pageDone,pages.size(),prior.isEmpty()?"正在下载":"正在校验已有页面");}
                PhoneDownloadStore.putChapter(getApplicationContext(),comicId,online.title,online.author,new PhoneDownloadStore.Chapter(episode.id,episode.title,episode.order,stored));episodeDone++;publish(comicId,online.title,episode.title,episodeDone,episodeTotal,pageDone,pages.size(),"章节完成");
            }
            UnifiedPicaCatalogSync.merge(getApplicationContext(),online);PhoneDownloadStore.reconcileCatalog(getApplicationContext());Data done=progress(episodeTotal,episodeTotal,0,0,online.title,"","下载完成");return Result.success(done);
        }catch(Exception e){String message=e.getMessage()==null?"下载失败":e.getMessage();if(getRunAttemptCount()<3)return Result.retry();return failure(message);}
    }

    private void publish(String comicId,String title,String episodeTitle,int episodeDone,int episodeTotal,int pageDone,int pageTotal,String phase){Data data=progress(episodeDone,episodeTotal,pageDone,pageTotal,title,episodeTitle,phase);setProgressAsync(data);setForegroundAsync(foreground(comicId,title,episodeTitle.isEmpty()?phase:episodeTitle+" · "+pageDone+" / "+pageTotal,pageDone,pageTotal));}
    private static Data progress(int episodeDone,int episodeTotal,int pageDone,int pageTotal,String title,String episodeTitle,String phase){return new Data.Builder().putInt(KEY_DONE,episodeDone).putInt(KEY_TOTAL,episodeTotal).putInt(KEY_EPISODE_DONE,episodeDone).putInt(KEY_EPISODE_TOTAL,episodeTotal).putInt(KEY_PAGE_DONE,pageDone).putInt(KEY_PAGE_TOTAL,pageTotal).putString(KEY_TITLE,title).putString(KEY_EPISODE_TITLE,episodeTitle).putString(KEY_PHASE,phase).build();}
    private Result failure(String message){return Result.failure(new Data.Builder().putString(KEY_PHASE,message).build());}

    private ForegroundInfo foreground(String comicId,String title,String text,int done,int total){
        NotificationManager manager=(NotificationManager)getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Pica Library 下载",NotificationManager.IMPORTANCE_LOW));Intent intent=new Intent(getApplicationContext(),DownloadsActivity.class);PendingIntent pending=PendingIntent.getActivity(getApplicationContext(),0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);NotificationCompat.Builder b=new NotificationCompat.Builder(getApplicationContext(),CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(title==null||title.isEmpty()?"Pica Library 下载":title).setContentText(text).setContentIntent(pending).setOnlyAlertOnce(true).setOngoing(true);if(total>0)b.setProgress(total,Math.max(0,Math.min(done,total)),false);else b.setProgress(0,0,true);Notification notification=b.build();int id=0x53000000|(ReaderPolicy.hash(comicId).hashCode()&0x00ffffff);if(Build.VERSION.SDK_INT>=29)return new ForegroundInfo(id,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);return new ForegroundInfo(id,notification);
    }

    private String download(PicaClient client,String comicId,PicaClient.Episode episode,PicaClient.Page page) throws Exception {
        String ext=extension(page.url),name=String.format(Locale.ROOT,"%06d%s",page.position+1,ext),tree=StorageSettings.downloadTreeUri(getApplicationContext());
        if(tree!=null&&!tree.isEmpty())return downloadDocument(client,episode,page,name,ext,tree);
        File base=getApplicationContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);if(base==null)base=getApplicationContext().getFilesDir();File target=new File(new File(new File(new File(base,"PicaLibraryDownloads"),comicId),episode.id),name);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".part");if(tmp.exists())tmp.delete();
        try{try(OutputStream out=new FileOutputStream(tmp)){copy(client,page.url,out);}validateLength(tmp.length());if(target.exists()&&!target.delete())throw new IOException("无法替换已下载页面");if(!tmp.renameTo(target))throw new IOException("无法完成页面下载");return Uri.fromFile(target).toString();}catch(Exception e){tmp.delete();throw e;}
    }
    private String downloadDocument(PicaClient client,PicaClient.Episode episode,PicaClient.Page page,String name,String ext,String tree) throws Exception {
        DocumentFile root=DocumentFile.fromTreeUri(getApplicationContext(),Uri.parse(tree));if(root==null||!root.canWrite())throw new IOException("手机下载目录不可写，请重新选择");DocumentFile library=dir(root,"PicaLibraryDownloads"),comic=dir(library,getInputData().getString(KEY_COMIC)),chapter=dir(comic,episode.id);DocumentFile orphan=chapter.findFile(name);if(orphan!=null)orphan.delete();String partName=name+".part";DocumentFile oldPart=chapter.findFile(partName);if(oldPart!=null)oldPart.delete();DocumentFile part=chapter.createFile("application/octet-stream",partName);if(part==null)throw new IOException("无法创建临时下载页面");try{try(OutputStream out=getApplicationContext().getContentResolver().openOutputStream(part.getUri(),"wt")){if(out==null)throw new IOException("无法写入下载页面");copy(client,page.url,out);}validateLength(part.length());if(part.renameTo(name))return part.getUri().toString();DocumentFile target=chapter.createFile(mime(ext),name);if(target==null)throw new IOException("无法完成下载页面");try(InputStream in=getApplicationContext().getContentResolver().openInputStream(part.getUri());OutputStream out=getApplicationContext().getContentResolver().openOutputStream(target.getUri(),"wt")){if(in==null||out==null)throw new IOException("无法提交临时下载页面");byte[] b=new byte[32768];int n;while((n=in.read(b))>0)out.write(b,0,n);}validateLength(target.length());part.delete();return target.getUri().toString();}catch(Exception e){part.delete();throw e;}
    }
    private void copy(PicaClient client,String url,OutputStream out) throws Exception {HttpURLConnection c=client.media(url);try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("图片 HTTP "+status);try(InputStream in=c.getInputStream()){byte[] b=new byte[32768];int n;long bytes=0;while((n=in.read(b))>0){if(isStopped())throw new IOException("下载已停止");bytes+=n;if(bytes>64L*1024*1024)throw new IOException("单页文件过大");out.write(b,0,n);}}}finally{c.disconnect();}}
    private static void validateLength(long length) throws IOException {if(length<=0)throw new IOException("下载页面为空");}
    private static DocumentFile dir(DocumentFile parent,String name) throws IOException {DocumentFile value=parent.findFile(name);if(value!=null&&value.isDirectory())return value;if(value!=null)value.delete();value=parent.createDirectory(name);if(value==null)throw new IOException("无法创建目录 "+name);return value;}
    private static String extension(String url){String lower=url==null?"":url.toLowerCase(Locale.ROOT);if(lower.matches(".*\\.png(\\?.*)?$"))return ".png";if(lower.matches(".*\\.webp(\\?.*)?$"))return ".webp";if(lower.matches(".*\\.gif(\\?.*)?$"))return ".gif";return ".jpg";}
    private static String mime(String ext){if(".png".equals(ext))return "image/png";if(".webp".equals(ext))return "image/webp";if(".gif".equals(ext))return "image/gif";return "image/jpeg";}
}
