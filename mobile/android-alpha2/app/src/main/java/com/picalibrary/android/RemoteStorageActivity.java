package com.picalibrary.android;

import android.app.*;
import android.os.Bundle;
import android.view.View;
import android.widget.*;
import java.util.*;

/** Manage multiple named WebDAV targets and choose the active mobile cloud source. */
public class RemoteStorageActivity extends Activity {
    private Spinner targetSpinner,vendorSpinner;
    private EditText label,url,root,user,password;
    private TextView status,providerNote;
    private boolean binding=false,creating=false;
    private String selectedId="";
    private List<RemoteConfigStore.Config> targets=new ArrayList<>();
    private List<RemoteConfigStore.Preset> presets=new ArrayList<>();

    @Override public void onCreate(Bundle b){super.onCreate(b);Ui.applyWindow(this);render();}
    private Button button(String text){return Ui.button(this,text,v->{},false);}

    private void render(){
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);scroll.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setBackgroundColor(Ui.BG);p.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,24));scroll.addView(p);
        p.addView(Ui.text(this,"远程存储",27,Ui.TEXT,true));p.addView(Ui.text(this,"可保存多个 WebDAV 网盘。手机一次使用一个“当前网盘”，切换后书库、封面、阅读和进度都会读取所选目标。",12,Ui.MUTED,false));Ui.gap(p,this,12);

        p.addView(Ui.text(this,"已配置网盘",13,Ui.TEXT,true));targetSpinner=new Spinner(this);p.addView(targetSpinner);Ui.gap(p,this,8);
        LinearLayout targetActions=new LinearLayout(this);Button add=button("＋ 新增网盘"),remove=button("删除当前");targetActions.addView(add,new LinearLayout.LayoutParams(0,-2,1));Ui.gap(targetActions,this,8);targetActions.addView(remove,new LinearLayout.LayoutParams(0,-2,1));p.addView(targetActions);Ui.gap(p,this,10);

        p.addView(Ui.text(this,"网盘类型",13,Ui.TEXT,true));vendorSpinner=new Spinner(this);p.addView(vendorSpinner);Ui.gap(p,this,8);
        label=field(p,"显示名称","","例如：我的 123 云盘");
        url=field(p,"WebDAV 地址","","https://dav.example.com/path");
        root=field(p,"根目录","PicaLibrary","PicaLibrary");
        user=field(p,"用户名","","留空则保留已保存用户名");
        password=field(p,"密码 / App Password","","留空则保留已保存密码");password.setInputType(0x00000081);
        providerNote=Ui.text(this,"",12,Ui.MUTED,false);providerNote.setPadding(0,0,0,Ui.dp(this,8));p.addView(providerNote);
        status=Ui.text(this,"",13,Ui.MUTED,false);status.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));p.addView(status);

        LinearLayout actions=new LinearLayout(this);Button test=button("测试连接"),save=button("保存并设为当前");actions.addView(test,new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,8);actions.addView(save,new LinearLayout.LayoutParams(0,-2,1));p.addView(actions);
        Button refresh=button("刷新当前网盘状态");refresh.setOnClickListener(v->refreshPortableState());p.addView(refresh);
        p.addView(Ui.text(this,"切换网盘只改变手机当前使用的远程来源，不会删除其他网盘里的漫画，也不会把数据自动复制到所有网盘。",12,Ui.MUTED,false));

        setContentView(scroll);scroll.requestApplyInsets();
        add.setOnClickListener(v->beginNew());remove.setOnClickListener(v->deleteCurrent());test.setOnClickListener(v->test(false));save.setOnClickListener(v->test(true));
        loadUi(RemoteConfigStore.activeTargetId(this));
    }

    private EditText field(LinearLayout p,String title,String value,String hint){p.addView(Ui.text(this,title,13,Ui.TEXT,true));EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);Ui.styleField(e,this);p.addView(e);Ui.gap(p,this,8);return e;}

    private void loadUi(String preferred){
        binding=true;targets=new ArrayList<>(RemoteConfigStore.targets(this));presets=new ArrayList<>(RemoteConfigStore.presets());
        List<String> targetNames=new ArrayList<>();if(targets.isEmpty())targetNames.add("尚未配置");else for(RemoteConfigStore.Config c:targets)targetNames.add(c.label+" · "+RemoteConfigStore.preset(c.vendor).label);
        targetSpinner.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,targetNames));
        List<String> vendorNames=new ArrayList<>();for(RemoteConfigStore.Preset preset:presets)vendorNames.add(preset.label);vendorSpinner.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,vendorNames));
        int index=0;if(preferred!=null&&!preferred.isEmpty())for(int i=0;i<targets.size();i++)if(preferred.equals(targets.get(i).id)){index=i;break;}
        if(!targets.isEmpty()){targetSpinner.setSelection(index,false);fill(targets.get(index));}else beginNewInternal();
        binding=false;
        targetSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> parent){}public void onItemSelected(AdapterView<?> parent,View view,int position,long id){if(binding||targets.isEmpty()||position<0||position>=targets.size())return;switchTarget(targets.get(position));}});
        vendorSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> parent){}public void onItemSelected(AdapterView<?> parent,View view,int position,long id){if(binding)return;applyPreset(creating||url.getText().toString().trim().isEmpty());}});
        updateStatus();
    }

    private void fill(RemoteConfigStore.Config c){creating=false;selectedId=c.id;label.setText(c.label);url.setText(c.baseUrl);root.setText(c.root);user.setText("");password.setText("");selectVendor(c.vendor);applyPreset(false);}
    private void selectVendor(String vendor){for(int i=0;i<presets.size();i++)if(presets.get(i).vendor.equals(vendor)){vendorSpinner.setSelection(i,false);return;}vendorSpinner.setSelection(0,false);}
    private RemoteConfigStore.Preset currentPreset(){int i=vendorSpinner.getSelectedItemPosition();return i>=0&&i<presets.size()?presets.get(i):RemoteConfigStore.preset("generic");}
    private void applyPreset(boolean forceUrl){RemoteConfigStore.Preset preset=currentPreset();if(forceUrl&&!preset.defaultBaseUrl.isEmpty())url.setText(preset.defaultBaseUrl);url.setHint(preset.urlHint);user.setHint(preset.usernameHint+" · 留空沿用已保存值");password.setHint(preset.passwordHint+" · 留空沿用已保存值");providerNote.setText(preset.note);if(creating&&label.getText().toString().trim().isEmpty())label.setText(preset.label);}

    private void beginNew(){binding=true;beginNewInternal();binding=false;status.setText("正在新增网盘配置；保存成功后才会切换当前来源。");}
    private void beginNewInternal(){creating=true;selectedId="";label.setText("");url.setText("");root.setText("PicaLibrary");user.setText("");password.setText("");selectVendor("generic");applyPreset(false);}

    private void switchTarget(RemoteConfigStore.Config target){try{RemoteConfigStore.setActive(this,target.id);fill(target);updateStatus();status.setText("已切换到“"+target.label+"”，正在刷新云端目录…");refreshPortableState();}catch(Exception e){status.setText("切换失败："+message(e));}}

    private RemoteConfigStore.Config formCandidate(){RemoteConfigStore.Config fallback=creating?null:RemoteConfigStore.find(this,selectedId);RemoteConfigStore.Preset preset=currentPreset();return RemoteConfigStore.candidate(selectedId,label.getText().toString(),preset.vendor,url.getText().toString(),root.getText().toString(),user.getText().toString(),password.getText().toString(),fallback);}

    private void test(boolean save){
        final boolean createRequest=creating;final String currentId=selectedId;status.setText(save?"正在保存并连接…":"正在测试…");new Thread(()->{try{
            RemoteConfigStore.Config candidate=formCandidate();boolean ok=new RemoteLibraryClient(candidate).test();RemoteConfigStore.Config saved=candidate;
            if(save&&ok){String saveId=createRequest?"remote-"+UUID.randomUUID().toString().replace("-","").substring(0,16):currentId;saved=RemoteConfigStore.saveTarget(this,saveId,candidate.label,candidate.vendor,candidate.baseUrl,candidate.root,candidate.username,candidate.password);try{cachePortableState();}catch(Exception ignored){}}
            RemoteConfigStore.Config finalSaved=saved;runOnUiThread(()->{url.setText(finalSaved.baseUrl);status.setText(ok?(save?"已保存并连接成功 · 当前："+finalSaved.label:"连接成功 · "+finalSaved.label):"连接不可用");if(save&&ok){password.setText("");user.setText("");loadUi(finalSaved.id);}});
        }catch(Exception e){runOnUiThread(()->status.setText("连接失败："+message(e)));}}).start();
    }

    private void deleteCurrent(){
        if(creating||selectedId.isEmpty()){beginNew();return;}RemoteConfigStore.Config target=RemoteConfigStore.find(this,selectedId);if(target==null)return;
        new AlertDialog.Builder(this).setTitle("删除网盘配置？").setMessage("只删除手机上的“"+target.label+"”连接信息，不会删除网盘里的漫画文件。")
            .setNegativeButton("取消",null).setPositiveButton("删除",(d,w)->{RemoteConfigStore.deleteTarget(this,target.id);loadUi(RemoteConfigStore.activeTargetId(this));status.setText("已删除手机端网盘配置；云端文件未删除。");}).show();
    }

    private void cachePortableState() throws Exception {
        RemoteLibraryClient client=new RemoteLibraryClient(this);UnifiedRemoteCatalogSync.refresh(this);FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.fromRemote(client.favorites());FavoriteCacheStore.save(this,favorites.items,false);
        if(ShelfStore.load(this).activeShelves().isEmpty())try{ShelfStore.save(this,ShelfStore.fromRemote(client.shelves()));}catch(Exception ignored){}
        try{ReaderSettingsStore.reconcile(this);}catch(Exception ignored){}UnifiedCatalogStore.reconcileLocalReferences(this);StoragePolicy.maintain(this);
    }

    private void refreshPortableState(){RemoteConfigStore.Config active=RemoteConfigStore.load(this);if(!active.configured()){status.setText("请先保存一个网盘配置");return;}status.setText("正在刷新“"+active.label+"”…");new Thread(()->{try{cachePortableState();runOnUiThread(()->{updateStatus();status.setText("“"+RemoteConfigStore.load(this).label+"”云端状态已刷新");});}catch(Exception e){runOnUiThread(()->status.setText("刷新失败："+message(e)));}}).start();}

    private void updateStatus(){RemoteConfigStore.Config active=RemoteConfigStore.load(this);int count=RemoteConfigStore.targets(this).size();status.setText(active.configured()?"已配置 "+count+" 个网盘 · 当前："+active.label:"尚未配置远程存储");}
    private String message(Exception e){return e.getMessage()==null?"请检查配置":e.getMessage();}
}
