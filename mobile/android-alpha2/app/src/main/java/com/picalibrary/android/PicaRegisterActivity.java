package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/** One explicit registration submission, independently of Desktop. No auto-login. */
public final class PicaRegisterActivity extends LocaleAwareActivity {
    private final Map<String,EditText> fields = new LinkedHashMap<>();
    private TextView status;
    private CheckBox consent;
    private Spinner gender;
    private Button submit, back;
    private boolean busy;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Ui.applyWindow(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);scroll.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,18),Ui.dp(this,16),Ui.dp(this,18),Ui.dp(this,24));scroll.addView(content);
        back=Ui.button(this,"‹ 返回登录",v->finish(),true);content.addView(back);
        content.addView(Ui.text(this,"注册 Pica 账号",24,Ui.TEXT,true));
        field(content,"name","昵称（2–50 字）",false);
        field(content,"email","登录账号（小写字母 / 数字 / _）",false);
        field(content,"password","密码（至少 8 位）",true);
        field(content,"confirmPassword","确认密码",true);
        field(content,"birthday","出生日期（YYYY-MM-DD，18+）",false);
        gender=new Spinner(this);gender.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"请选择性别","男","女","其他"}));content.addView(gender);
        for(int i=1;i<=3;i++){field(content,"question"+i,"安全问题 "+i,false);field(content,"answer"+i,"安全答案 "+i,true);}
        consent=new CheckBox(this);consent.setText(LocalizedText.ui("我已年满 18 岁并同意遵守 Pica 服务条款；Pica Library 不保存安全答案。"));consent.setTextColor(Ui.TEXT);content.addView(consent);
        status=Ui.text(this,"",13,Ui.MUTED,false);status.setVisibility(View.GONE);content.addView(status);
        submit=Ui.button(this,"确认并注册",v->register(),false);content.addView(submit);
        setContentView(scroll);scroll.requestApplyInsets();
    }

    private void field(LinearLayout target,String key,String title,boolean secret){
        target.addView(Ui.text(this,title,13,Ui.TEXT,true));
        EditText input=new EditText(this);input.setSingleLine(true);input.setSaveEnabled(false);input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        if(secret)input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Ui.styleField(input,this);fields.put(key,input);target.addView(input);
    }

    private Map<String,String> snapshot(){Map<String,String> input=new LinkedHashMap<>();for(Map.Entry<String,EditText> entry:fields.entrySet())input.put(entry.getKey(),entry.getValue().getText().toString());input.put("gender",new String[]{"","m","f","bot"}[gender.getSelectedItemPosition()]);return input;}
    private void clearErrors(){for(EditText input:fields.values())input.setError(null);hideStatus();}
    private void hideStatus(){status.setText("");status.setVisibility(View.GONE);}
    private void showStatus(String value,int color){status.setText(value);status.setTextColor(color);status.setVisibility(View.VISIBLE);}
    private void showFieldError(String field,String message){
        if(field==null||field.isEmpty()){showStatus(message,Ui.BAD);return;}
        if("gender".equals(field)||"consent".equals(field)){showStatus(message,Ui.BAD);return;}
        EditText input=fields.get(field);if(input==null){showStatus(message,Ui.BAD);return;}input.setError(message);input.requestFocus();showStatus("请修改标红项",Ui.BAD);
    }

    private void register(){
        if(busy)return;clearErrors();
        final Map<String,String> payload;
        try{payload=PicaRegistrationInput.validate(snapshot(),consent.isChecked(),LocalDate.now(java.time.ZoneOffset.UTC));}
        catch(PicaRegistrationInput.ValidationException error){showFieldError(error.field,error.getMessage());return;}
        catch(IllegalArgumentException error){showStatus(error.getMessage()==null?"请检查注册信息":error.getMessage(),Ui.BAD);return;}
        busy=true;submit.setEnabled(false);back.setEnabled(false);showStatus("正在提交…",Ui.MUTED);
        new Thread(()->{
            String message="";String field="";boolean success=false;boolean retrySafe=false;
            try{new PicaClient(this).register(payload);success=true;message="注册成功，请返回登录";}
            catch(Exception error){retrySafe=PicaAccountErrors.retrySafe(error);field=PicaAccountErrors.field(error);message=PicaAccountErrors.message(error);}
            finally{payload.clear();}
            final String result=message,failedField=field;final boolean registered=success,canRetry=retrySafe;
            runOnUiThread(()->{
                busy=false;back.setEnabled(true);
                if(registered){showStatus(result,Ui.GOOD);for(EditText input:fields.values())input.setText("");gender.setSelection(0);consent.setChecked(false);return;}
                if(failedField.isEmpty())showStatus(result,Ui.BAD);else showFieldError(failedField,result);
                if(canRetry)submit.setEnabled(true);
                else showStatus(result+"；如果刚提交过，请先尝试登录，不要立即重复注册",Ui.BAD);
            });
        },"pica-registration").start();
    }

    @Override public void onBackPressed(){if(!busy)super.onBackPressed();}
}
