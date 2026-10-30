package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Small QA shell over the exact original local ShelfLedger and Reader.
 * Shelves and their tombstones are never confused with imported comic files.
 */
public final class LocalShelvesActivity extends Activity {
    private interface Change {void run() throws Exception;}
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<String> labels=new ArrayList<>();
    private List<ShelfLedger.Shelf> shelves=Collections.emptyList();
    private List<LocalComicReaderPort.Book> available=Collections.emptyList();
    private List<ShelfLedger.Item> entries=Collections.emptyList();
    private String selectedShelfId="";
    private ShelfLedger.Shelf selected;
    private ArrayAdapter<String> adapter;
    private TextView title,status;
    private Button primary,manage;
    private boolean busy,destroyed;
    private int readSerial;

    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private String text(String zh,String en,String ja){return LocalCopy.ui(this,zh,en,ja);}
    private File store(){return ShelfLedger.localFile(getApplicationContext());}
    private Button button(String label){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);return b;
    }
    private TextView caption(String value,int size){
        TextView t=new TextView(this);
        t.setText(value);t.setTextSize(size);t.setTextColor(Color.WHITE);
        return t;
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        if(state!=null)selectedShelfId=state.getString("selectedShelf","");
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(12),dp(12),dp(12),dp(12));
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setOnApplyWindowInsetsListener((v,i)->{
            v.setPadding(dp(12),i.getSystemWindowInsetTop()+dp(12),
                    dp(12),i.getSystemWindowInsetBottom()+dp(12));
            return i;
        });
        LinearLayout header=new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back=button(text("返回","Back","戻る"));
        back.setOnClickListener(v->{
            if(selectedShelfId.isEmpty())finish();
            else{selectedShelfId="";refresh();}
        });
        header.addView(back,new LinearLayout.LayoutParams(dp(88),dp(48)));
        title=caption("",21);
        title.setMaxLines(2);
        header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(header);

        LinearLayout commands=new LinearLayout(this);
        primary=button("");
        manage=button(text("管理","Manage","管理"));
        commands.addView(primary,new LinearLayout.LayoutParams(0,dp(52),1));
        commands.addView(manage,new LinearLayout.LayoutParams(dp(112),dp(52)));
        primary.setOnClickListener(v->{
            if(busy)return;
            if(selected==null)createShelf();
            else addComic();
        });
        manage.setOnClickListener(v->{if(!busy&&selected!=null)manageShelf();});
        root.addView(commands);

        status=caption("",13);
        status.setPadding(dp(8),dp(8),dp(8),dp(8));
        root.addView(status);

        ListView list=new ListView(this);
        adapter=new ArrayAdapter<String>(this,android.R.layout.simple_list_item_1,labels){
            @Override public View getView(int position,View convertView,ViewGroup parent){
                TextView row=convertView instanceof TextView?(TextView)convertView:caption("",16);
                row.setText(getItem(position));
                row.setPadding(dp(12),dp(12),dp(12),dp(12));
                row.setMinHeight(dp(62));
                return row;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent,view,position,id)->{
            if(busy)return;
            if(selected==null){
                if(position>=0&&position<shelves.size()){
                    selectedShelfId=shelves.get(position).id;
                    refresh();
                }
            }else if(position>=0&&position<entries.size()){
                ShelfLedger.Item item=entries.get(position);
                if(!LocalComicStore.has(this,item.comicId)){
                    Toast.makeText(this,text("本地副本已不存在","Local copy not found","ローカルコピーがありません"),Toast.LENGTH_LONG).show();
                    return;
                }
                Intent reader=new Intent(this,LocalReaderActivity.class);
                reader.putExtra("source","local");
                reader.putExtra("comicId",item.comicId);
                reader.putExtra("title",item.title);
                startActivity(reader);
            }
        });
        list.setOnItemLongClickListener((parent,view,position,id)->{
            if(busy||selected==null||position<0||position>=entries.size())return false;
            ShelfLedger.Item item=entries.get(position);
            new AlertDialog.Builder(this)
                .setTitle(text("从书架移出？","Remove from shelf?","本棚から外しますか？"))
                .setMessage(item.title)
                .setNegativeButton(android.R.string.cancel,null)
                .setPositiveButton(text("移出","Remove","外す"),(d,w)->operate(
                    ()->ShelfLedger.setMembership(store(),selectedShelfId,item,false)))
                .show();
            return true;
        });
        root.addView(list,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        render();
        refresh();
    }

    @Override protected void onSaveInstanceState(Bundle state){
        state.putString("selectedShelf",selectedShelfId);
        super.onSaveInstanceState(state);
    }
    @Override protected void onResume(){super.onResume();if(adapter!=null&&!busy)refresh();}
    private void render(){
        selected=null;
        for(ShelfLedger.Shelf shelf:shelves)if(shelf.id.equals(selectedShelfId)){
            selected=shelf;
            break;
        }
        if(selected==null)selectedShelfId="";
        labels.clear();
        entries=Collections.emptyList();
        if(selected==null){
            title.setText(text("本地书架","Local shelves","ローカル本棚"));
            primary.setText(text("新建书架","New shelf","新しい本棚"));
            manage.setVisibility(View.GONE);
            for(ShelfLedger.Shelf shelf:shelves)
                labels.add(shelf.name+" · "+shelf.activeItems().size());
        }else{
            title.setText(selected.name);
            primary.setText(text("加入作品","Add comic","作品を追加"));
            manage.setVisibility(View.VISIBLE);
            entries=selected.activeItems();
            for(ShelfLedger.Item item:entries)
                labels.add(item.title+(!LocalComicStore.has(this,item.comicId)
                    ?text(" · 文件不可用"," · Missing file"," · ファイルなし"):""));
        }
        primary.setEnabled(!busy);
        manage.setEnabled(!busy);
        adapter.notifyDataSetChanged();
        if(!busy)status.setText(selected==null
            ?(shelves.isEmpty()?text("还没有书架","No shelves yet","本棚はまだありません"):
               text("书架数：","Shelves: ","本棚：")+shelves.size())
            :(entries.isEmpty()?text("书架为空，可从本地书库加入作品",
                                    "Empty shelf; add an imported comic",
                                    "本棚は空です。取り込んだ作品を追加できます"):
               text("作品数：","Comics: ","作品：")+entries.size()));
    }
    private void refresh(){
        int serial=++readSerial;
        worker.execute(()->{
            List<ShelfLedger.Shelf> fresh=ShelfLedger.load(store()).activeShelves();
            List<LocalComicReaderPort.Book> books=new LocalComicReaderPort(getApplicationContext()).books();
            runOnUiThread(()->{
                if(destroyed||serial!=readSerial)return;
                shelves=fresh;available=books;
                busy=false;render();
            });
        });
    }
    private void operate(Change change){
        if(busy)return;
        busy=true;
        status.setText(text("正在保存…","Saving…","保存中…"));
        primary.setEnabled(false);manage.setEnabled(false);
        worker.execute(()->{
            String error=null;
            try{change.run();}catch(Exception e){error=e.getMessage();}
            String failure=error;
            runOnUiThread(()->{
                if(destroyed)return;
                if(failure!=null){
                    busy=false;render();
                    status.setText(text("操作失败：","Action failed: ","操作失敗：")+failure);
                }else refresh();
            });
        });
    }
    private void createShelf(){
        EditText input=new EditText(this);
        input.setSingleLine(true);
        input.setHint(text("书架名称","Shelf name","本棚の名前"));
        new AlertDialog.Builder(this)
            .setTitle(text("新建书架","Create shelf","本棚を作成"))
            .setView(input)
            .setNegativeButton(android.R.string.cancel,null)
            .setPositiveButton(text("创建","Create","作成"),
                (d,w)->operate(()->ShelfLedger.create(store(),input.getText().toString())))
            .show();
    }
    private void manageShelf(){
        if(selected==null)return;
        String id=selected.id;
        String[] commands={text("重命名","Rename","名前を変更"),text("删除书架","Delete shelf","本棚を削除")};
        new AlertDialog.Builder(this).setTitle(selected.name)
            .setItems(commands,(dialog,which)->{
                if(which==0){
                    EditText input=new EditText(this);
                    input.setText(selected.name);input.setSingleLine(true);
                    new AlertDialog.Builder(this)
                        .setTitle(text("重命名书架","Rename shelf","本棚の名前を変更"))
                        .setView(input).setNegativeButton(android.R.string.cancel,null)
                        .setPositiveButton(text("保存","Save","保存"),
                            (d,w)->operate(()->ShelfLedger.rename(store(),id,input.getText().toString())))
                        .show();
                }else{
                    new AlertDialog.Builder(this)
                        .setTitle(text("删除书架？","Delete shelf?","本棚を削除しますか？"))
                        .setMessage(text("只删除书架，不会删除本地漫画文件。",
                            "The shelf is removed; imported comic files are kept.",
                            "本棚だけを削除し、取り込んだファイルは残ります。"))
                        .setNegativeButton(android.R.string.cancel,null)
                        .setPositiveButton(text("删除","Delete","削除"),(d,w)->operate(()->{
                            ShelfLedger.delete(store(),id);
                            runOnUiThread(()->selectedShelfId="");
                        })).show();
                }
            }).show();
    }
    private void addComic(){
        if(selected==null)return;
        ArrayList<LocalComicReaderPort.Book> choices=new ArrayList<>();
        for(LocalComicReaderPort.Book book:available){
            boolean already=false;
            for(ShelfLedger.Item item:selected.activeItems())if(item.comicId.equals(book.id)){
                already=true;break;
            }
            if(!already)choices.add(book);
        }
        if(choices.isEmpty()){
            Toast.makeText(this,text("没有其他可加入的本地作品",
                "No other imported comics to add","追加できる作品はありません"),Toast.LENGTH_SHORT).show();
            return;
        }
        String shelfId=selectedShelfId;
        String[] titles=new String[choices.size()];
        for(int i=0;i<choices.size();i++)titles[i]=choices.get(i).title;
        new AlertDialog.Builder(this)
            .setTitle(text("加入书架","Add to shelf","本棚に追加"))
            .setItems(titles,(d,which)->{
                LocalComicReaderPort.Book book=choices.get(which);
                ShelfLedger.Item item=new ShelfLedger.Item(book.id,book.title,"","",
                    Collections.emptyList(),Collections.emptyList(),false,0,
                    book.pageCount,ShelfLedger.now());
                operate(()->ShelfLedger.setMembership(store(),shelfId,item,true));
            }).setNegativeButton(android.R.string.cancel,null).show();
    }
    @Override protected void onDestroy(){
        destroyed=true;worker.shutdownNow();super.onDestroy();
    }
}
