package com.picalibrary.android;

import android.app.*;
import android.os.Bundle;
import android.view.View;
import android.widget.*;
import java.util.*;

/** Manage multiple named WebDAV targets and choose the active mobile cloud source. */
public class RemoteStorageActivity extends LocaleAwareActivity {
    private Spinner targetSpinner,vendorSpinner;
    private EditText label,url,root,user,password;
    private TextView status,providerNote;
    private boolean binding=false,creating=false;
    private String selectedId="";
    private List<RemoteConfigStore.Config> targets=new ArrayList<>();
    private List<RemoteConfigStore.Preset> presets=new ArrayList<>();

    @Override public void onCreate(Bundle b){super.onCreate(b);Ui.applyWindow(this);render();}
    private Button button(String text){return Ui.button(this,text,v->{},false);}
    private String t(String zh,String en,String ja){return LocalizedText.ui(this,zh,en,ja);}

    private void render(){
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);scroll.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,24));scroll.addView(p);
        TextView heading=Ui.text(this,t("远程存储","Remote storage","リモートストレージ"),27,Ui.TEXT,true);
        heading.setTag("remote-storage-heading");
        p.addView(heading);
        p.addView(Ui.text(this,t("可保存多个 WebDAV 网盘。手机一次使用一个“当前网盘”，切换后书库、封面、阅读和进度都会读取所选目标。",
            "Save multiple WebDAV connections. Your phone uses one active storage at a time; switching changes the selected library, covers, reading and progress.",
            "複数の WebDAV 接続を保存できます。端末で使う保存先は一度に一つで、切り替えると書庫・表紙・閲覧・進捗の参照先が変わります。"),12,Ui.MUTED,false));Ui.gap(p,this,12);

        p.addView(Ui.text(this,t("已配置网盘","Configured storage","設定済みストレージ"),13,Ui.TEXT,true));targetSpinner=new Spinner(this);
        targetSpinner.setTag(AndroidOnboarding.ADV_REMOTE_TARGET);
        p.addView(targetSpinner);Ui.gap(p,this,8);
        LinearLayout targetActions=new LinearLayout(this);Button add=button(t("＋ 新增网盘","＋ Add storage","＋ 保存先を追加")),remove=button(t("删除当前","Remove selected","選択中を削除"));targetActions.addView(add,new LinearLayout.LayoutParams(0,-2,1));Ui.gap(targetActions,this,8);targetActions.addView(remove,new LinearLayout.LayoutParams(0,-2,1));p.addView(targetActions);Ui.gap(p,this,10);

        p.addView(Ui.text(this,t("网盘类型","Storage type","保存先の種類"),13,Ui.TEXT,true));vendorSpinner=new Spinner(this);
        vendorSpinner.setTag(AndroidOnboarding.ADV_REMOTE_VENDOR);
        p.addView(vendorSpinner);Ui.gap(p,this,8);
        label=field(p,t("显示名称","Display name","表示名"),"",t("例如：我的 123 云盘","e.g. My storage","例：自分のクラウド"));
        url=field(p,t("WebDAV 地址","WebDAV address","WebDAV アドレス"),"","https://dav.example.com/path");
        root=field(p,t("根目录","Root directory","ルートフォルダー"),"PicaLibrary","PicaLibrary");
        user=field(p,t("用户名","Username","ユーザー名"),"",t("留空则保留已保存用户名","Leave blank to keep saved username","空欄なら保存済みのユーザー名を保持"));
        password=field(p,t("密码 / App Password","Password / app password","パスワード / アプリ用パスワード"),"",t("留空则保留已保存密码","Leave blank to keep saved password","空欄なら保存済みのパスワードを保持"));password.setInputType(0x00000081);
        providerNote=Ui.text(this,"",12,Ui.MUTED,false);providerNote.setTag("remote-storage-provider-note");providerNote.setPadding(0,0,0,Ui.dp(this,8));p.addView(providerNote);
        status=Ui.text(this,"",13,Ui.MUTED,false);status.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));p.addView(status);

        LinearLayout actions=new LinearLayout(this);Button test=button(t("测试连接","Test connection","接続をテスト")),save=button(t("保存并设为当前","Save and make active","保存して使用する"));
        test.setTag(AndroidOnboarding.ADV_REMOTE_TEST);actions.addView(test,new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,8);actions.addView(save,new LinearLayout.LayoutParams(0,-2,1));p.addView(actions);
        Button refresh=button(t("刷新当前网盘状态","Refresh active storage","現在の保存先を更新"));refresh.setOnClickListener(v->refreshPortableState());p.addView(refresh);
        p.addView(Ui.text(this,t("切换网盘只改变手机当前使用的远程来源，不会删除其他网盘里的漫画，也不会把数据自动复制到所有网盘。",
            "Switching storage changes only this phone's active source. It does not delete other cloud files or copy the library to every connection.",
            "保存先の切り替えは端末の参照先だけを変更します。他のクラウド内の作品を削除せず、すべての保存先へ自動コピーもしません。"),12,Ui.MUTED,false));

        setContentView(scroll);scroll.requestApplyInsets();
        add.setOnClickListener(v->beginNew());remove.setOnClickListener(v->deleteCurrent());test.setOnClickListener(v->test(false));save.setOnClickListener(v->test(true));
        loadUi(RemoteConfigStore.activeTargetId(this));
    }

    private EditText field(LinearLayout p,String title,String value,String hint){p.addView(Ui.text(this,title,13,Ui.TEXT,true));EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);Ui.styleField(e,this);p.addView(e);Ui.gap(p,this,8);return e;}

    private void loadUi(String preferred){
        binding=true;targets=new ArrayList<>(RemoteConfigStore.targets(this));presets=new ArrayList<>(RemoteConfigStore.presets());
        List<String> targetNames=new ArrayList<>();if(targets.isEmpty())targetNames.add(t("尚未配置","Not configured","未設定"));else for(RemoteConfigStore.Config c:targets)targetNames.add(c.label+" · "+RemoteStoragePresetUi.forPreset(this,RemoteConfigStore.preset(c.vendor)).label);
        targetSpinner.setAdapter(Ui.spinnerAdapter(this,targetNames));
        List<String> vendorNames=new ArrayList<>();for(RemoteConfigStore.Preset preset:presets)vendorNames.add(RemoteStoragePresetUi.forPreset(this,preset).label);vendorSpinner.setAdapter(Ui.spinnerAdapter(this,vendorNames));
        int index=0;if(preferred!=null&&!preferred.isEmpty())for(int i=0;i<targets.size();i++)if(preferred.equals(targets.get(i).id)){index=i;break;}
        if(!targets.isEmpty()){targetSpinner.setSelection(index,false);fill(targets.get(index));}else beginNewInternal();
        binding=false;
        targetSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> parent){}public void onItemSelected(AdapterView<?> parent,View view,int position,long id){if(binding||targets.isEmpty()||position<0||position>=targets.size())return;
            // Spinner's first callback must not start a network refresh merely by opening settings/guide.
            if(targets.get(position).id.equals(RemoteConfigStore.activeTargetId(RemoteStorageActivity.this)))return;
            switchTarget(targets.get(position));}});
        vendorSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> parent){}public void onItemSelected(AdapterView<?> parent,View view,int position,long id){if(binding)return;applyPreset(creating||url.getText().toString().trim().isEmpty());}});
        updateStatus();
    }

    private void fill(RemoteConfigStore.Config c){creating=false;selectedId=c.id;label.setText(c.label);url.setText(c.baseUrl);root.setText(c.root);user.setText("");password.setText("");selectVendor(c.vendor);applyPreset(false);}
    private void selectVendor(String vendor){for(int i=0;i<presets.size();i++)if(presets.get(i).vendor.equals(vendor)){vendorSpinner.setSelection(i,false);return;}vendorSpinner.setSelection(0,false);}
    private RemoteConfigStore.Preset currentPreset(){int i=vendorSpinner.getSelectedItemPosition();return i>=0&&i<presets.size()?presets.get(i):RemoteConfigStore.preset("generic");}
    private void applyPreset(boolean forceUrl){
        RemoteConfigStore.Preset preset=currentPreset();
        RemoteStoragePresetUi.Copy copy=RemoteStoragePresetUi.forPreset(this,preset);
        if(forceUrl&&!preset.defaultBaseUrl.isEmpty())url.setText(preset.defaultBaseUrl);
        url.setHint(copy.urlHint);
        String suffix=t(" · 留空沿用已保存值"," · blank keeps saved value"," · 空欄で保存済みの値を保持");
        user.setHint(copy.usernameHint+suffix);
        password.setHint(copy.passwordHint+suffix);
        providerNote.setText(copy.note);
        if(creating&&label.getText().toString().trim().isEmpty())label.setText(copy.label);
    }

    private void beginNew(){binding=true;beginNewInternal();binding=false;status.setText(t("正在新增网盘配置；保存成功后才会切换当前来源。","Creating a connection. The active storage changes only after a successful save.","新しい接続を作成しています。保存に成功するまで現在の保存先は変わりません。"));}
    private void beginNewInternal(){creating=true;selectedId="";label.setText("");url.setText("");root.setText("PicaLibrary");user.setText("");password.setText("");selectVendor("generic");applyPreset(false);}

    private void switchTarget(RemoteConfigStore.Config target){try{RemoteConfigStore.setActive(this,target.id);fill(target);updateStatus();status.setText(t("已切换到“","Switched to ","切り替え先：")+target.label+t("”，正在刷新云端目录…","; refreshing cloud listing…","。クラウドの一覧を更新中…"));refreshPortableState();}catch(Exception e){status.setText(t("切换失败：","Switch failed: ","切り替え失敗：")+message(e));}}

    private RemoteConfigStore.Config formCandidate(){RemoteConfigStore.Config fallback=creating?null:RemoteConfigStore.find(this,selectedId);RemoteConfigStore.Preset preset=currentPreset();return RemoteConfigStore.candidate(selectedId,label.getText().toString(),preset.vendor,url.getText().toString(),root.getText().toString(),user.getText().toString(),password.getText().toString(),fallback);}

    private void test(boolean save){
        // Snapshot Android EditText/Spinner values before leaving the UI thread.
        // Remote connectivity and persistence stay on the worker; invalid input starts no network operation.
        final RemoteConfigStore.Config candidate;
        try{candidate=formCandidate();}
        catch(Exception error){
            status.setText(t("连接失败：","Connection failed: ","接続失敗：")+message(error));
            return;
        }
        final boolean createRequest=creating;
        final String currentId=selectedId;
        status.setText(save?t("正在保存并连接…","Saving and connecting…","保存して接続中…"):t("正在测试…","Testing connection…","接続を確認中…"));
        new Thread(()->{try{
            boolean ok=new RemoteLibraryClient(candidate).test();RemoteConfigStore.Config saved=candidate;
            if(save&&ok){String saveId=createRequest?"remote-"+UUID.randomUUID().toString().replace("-","").substring(0,16):currentId;saved=RemoteConfigStore.saveTarget(this,saveId,candidate.label,candidate.vendor,candidate.baseUrl,candidate.root,candidate.username,candidate.password);try{cachePortableState();}catch(Exception ignored){}}
            RemoteConfigStore.Config finalSaved=saved;runOnUiThread(()->{url.setText(finalSaved.baseUrl);status.setText(ok?(save?t("已保存并连接成功 · 当前：","Saved and connected · Active: ","保存・接続完了 · 使用中：")+finalSaved.label:t("连接成功 · ","Connection successful · ","接続成功 · ")+finalSaved.label):t("连接不可用","Connection unavailable","接続できません"));if(save&&ok){password.setText("");user.setText("");loadUi(finalSaved.id);}});
        }catch(Exception e){runOnUiThread(()->status.setText(t("连接失败：","Connection failed: ","接続失敗：")+message(e)));}}).start();
    }

    private void deleteCurrent(){
        if(creating||selectedId.isEmpty()){beginNew();return;}RemoteConfigStore.Config target=RemoteConfigStore.find(this,selectedId);if(target==null)return;
        new AlertDialog.Builder(this).setTitle(LocalizedText.ui("删除网盘配置？")).setMessage(LocalizedText.ui("只删除手机上的“")+target.label+LocalizedText.ui("”连接信息，不会删除网盘里的漫画文件。"))
            .setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("删除"),(d,w)->{RemoteConfigStore.deleteTarget(this,target.id);loadUi(RemoteConfigStore.activeTargetId(this));status.setText(LocalizedText.ui("已删除手机端网盘配置；云端文件未删除。"));}).show();
    }

    private void cachePortableState() throws Exception {
        RemoteLibraryClient client=new RemoteLibraryClient(this);UnifiedRemoteCatalogSync.refresh(this);FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.fromRemote(client.favorites());FavoriteCacheStore.save(this,favorites.items,false);
        if(ShelfStore.load(this).activeShelves().isEmpty())try{ShelfStore.save(this,ShelfStore.fromRemote(client.shelves()));}catch(Exception ignored){}
        try{ReaderSettingsStore.reconcile(this);}catch(Exception ignored){}UnifiedCatalogStore.reconcileLocalReferences(this);StoragePolicy.maintain(this);
    }

    private void refreshPortableState(){RemoteConfigStore.Config active=RemoteConfigStore.load(this);if(!active.configured()){status.setText(t("请先保存一个网盘配置","Save a storage connection first","先に保存先の接続を保存してください"));return;}status.setText(t("正在刷新“","Refreshing ","更新中：")+active.label+"…");new Thread(()->{try{cachePortableState();runOnUiThread(()->{updateStatus();status.setText(RemoteConfigStore.load(this).label+t(" 云端状态已刷新"," · Cloud status refreshed"," · クラウドの状態を更新しました"));});}catch(Exception e){runOnUiThread(()->status.setText(t("刷新失败：","Refresh failed: ","更新失敗：")+message(e)));}}).start();}

    private void updateStatus(){RemoteConfigStore.Config active=RemoteConfigStore.load(this);int count=RemoteConfigStore.targets(this).size();status.setText(active.configured()?t("已配置 ","Configured ","設定数：")+count+t(" 个网盘 · 当前："," storage connections · Active: "," 件 · 使用中：")+active.label:t("尚未配置远程存储","No remote storage configured","リモートストレージは未設定"));}
    private String message(Exception e){return e.getMessage()==null?t("请检查配置","Check connection settings","接続設定を確認してください"):e.getMessage();}
}
