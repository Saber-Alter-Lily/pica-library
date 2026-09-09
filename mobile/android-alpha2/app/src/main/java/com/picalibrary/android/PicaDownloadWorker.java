package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import androidx.annotation.NonNull;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** User-requested Pica download. Output is persistent user data, never reader cache. */
public final class PicaDownloadWorker extends Worker {
    static final String KEY_COMIC="comicId",KEY_EPISODE="episodeId",KEY_DONE="done",KEY_TOTAL="total",KEY_PHASE="phase";
    public PicaDownloadWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    @NonNull @Override public Result doWork(){
        String comicId=getInputData().getString(KEY_COMIC);String selected=getInputData().getString(KEY_EPISODE);if(comicId==null||comicId.isEmpty())return Result.failure();
        try{
            PicaClient client=new PicaClient(getApplicationContext());PicaClient.Comic online=client.comic(comicId);List<PicaClient.Episode> episodes=client.episodes(comicId);if(selected!=null&&!selected.isEmpty())episodes.removeIf(e->!e.id.equals(selected));if(episodes.isEmpty())return Result.failure();
            int totalEpisodes=episodes.size(),episodeDone=0;PhoneDownloadStore.Comic prior=PhoneDownloadStore.comic(getApplicationContext(),comicId);List<PhoneDownloadStore.Chapter> chapters=new ArrayList<>();if(prior!=null)chapters.addAll(prior.chapters);
            for(PicaClient.Episode episode:episodes){if(isStopped())return Result.retry();setProgressAsync(progress(episodeDone,totalEpisodes,"正在读取 "+episode.title));List<PicaClient.Page> pages=client.pages(comicId,episode.order);List<PhoneDownloadStore.Page> stored=new ArrayList<>();int pageDone=0;
                for(PicaClient.Page page:pages){if(isStopped())return Result.retry();String uri=download(client,comicId,episode,page);stored.add(new PhoneDownloadStore.Page(page.position,uri));pageDone++;setProgressAsync(progress(pageDone,pages.size(),"正在下载 "+episode.title));}
                PhoneDownloadStore.Chapter chapter=new PhoneDownloadStore.Chapter(episode.id,episode.title,episode.order,stored);chapters.removeIf(c->c.id.equals(episode.id));chapters.add(chapter);chapters.sort(Comparator.comparingInt(c->c.order));PhoneDownloadStore.put(getApplicationContext(),new PhoneDownloadStore.Comic(comicId,online.title,online.author,chapters));episodeDone++;
            }
            UnifiedPicaCatalogSync.merge(getApplicationContext(),online);PhoneDownloadStore.reconcileCatalog(getApplicationContext());return Result.success(progress(totalEpisodes,totalEpisodes,"下载完成"));
        }catch(Exception e){return Result.failure(new Data.Builder().putString(KEY_PHASE,e.getMessage()==null?"下载失败":e.getMessage()).build());}
    }

    private String download(PicaClient client,String comicId,PicaClient.Episode episode,PicaClient.Page page) throws Exception {
        String ext=extension(page.url);String name=String.format(Locale.ROOT,"%06d%s",page.position+1,ext);String tree=StorageSettings.downloadTreeUri(getApplicationContext());
        if(tree!=null&&!tree.isEmpty()){
            DocumentFile root=DocumentFile.fromTreeUri(getApplicationContext(),Uri.parse(tree));if(root==null||!root.canWrite())throw new IOException("手机下载目录不可写，请重新选择");DocumentFile library=dir(root,"PicaLibraryDownloads"),comic=dir(library,comicId),chapter=dir(comic,episode.id);DocumentFile target=chapter.findFile(name);if(target!=null&&target.isFile()&&target.length()>0)return target.getUri().toString();if(target!=null)target.delete();target=chapter.createFile(mime(ext),name);if(target==null)throw new IOException("无法创建下载页面");try(OutputStream out=getApplicationContext().getContentResolver().openOutputStream(target.getUri(),"wt")){if(out==null)throw new IOException("无法写入下载页面");copy(client,page.url,out);}return target.getUri().toString();
        }
        File base=getApplicationContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);if(base==null)base=getApplicationContext().getFilesDir();File target=new File(new File(new File(new File(base,"PicaLibraryDownloads"),comicId),episode.id),name);target.getParentFile().mkdirs();if(target.isFile()&&target.length()>0)return Uri.fromFile(target).toString();File tmp=new File(target.getParentFile(),target.getName()+".part");try(OutputStream out=new FileOutputStream(tmp)){copy(client,page.url,out);}if(target.exists()&&!target.delete())throw new IOException("无法替换已下载页面");if(!tmp.renameTo(target))throw new IOException("无法完成页面下载");return Uri.fromFile(target).toString();
    }
    private void copy(PicaClient client,String url,OutputStream out) throws Exception {HttpURLConnection c=client.media(url);try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("图片 HTTP "+status);try(InputStream in=c.getInputStream()){byte[] b=new byte[32768];int n;long bytes=0;while((n=in.read(b))>0){if(isStopped())throw new IOException("下载已停止");bytes+=n;if(bytes>64L*1024*1024)throw new IOException("单页文件过大");out.write(b,0,n);}}}finally{c.disconnect();}}
    private static DocumentFile dir(DocumentFile parent,String name) throws IOException {DocumentFile value=parent.findFile(name);if(value!=null&&value.isDirectory())return value;if(value!=null)value.delete();value=parent.createDirectory(name);if(value==null)throw new IOException("无法创建目录 "+name);return value;}
    private static String extension(String url){String lower=url==null?"":url.toLowerCase(Locale.ROOT);if(lower.matches(".*\\.(png)(\\?.*)?$"))return ".png";if(lower.matches(".*\\.(webp)(\\?.*)?$"))return ".webp";if(lower.matches(".*\\.(gif)(\\?.*)?$"))return ".gif";return ".jpg";}
    private static String mime(String ext){if(".png".equals(ext))return "image/png";if(".webp".equals(ext))return "image/webp";if(".gif".equals(ext))return "image/gif";return "image/jpeg";}
    private static Data progress(int done,int total,String phase){return new Data.Builder().putInt(KEY_DONE,done).putInt(KEY_TOTAL,total).putString(KEY_PHASE,phase).build();}
}
