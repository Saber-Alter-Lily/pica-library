package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.*;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/** One explicit registration submission, independently of Desktop. No auto-login. */
public final class PicaRegisterActivity extends Activity {
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
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Ui.BG);
        scroll.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,18),Ui.dp(this,16),Ui.dp(this,18),Ui.dp(this,24));
        scroll.addView(content);
        back = Ui.button(this,"‹ 返回登录",v->finish(),true);
        content.addView(back);
        content.addView(Ui.text(this,"注册 Pica 账号",24,Ui.TEXT,true));
        content.addView(Ui.text(this,"这是第三方哔咔账号，不是 GitHub 账号。手机独立连接 Pica，无需电脑。注册本身不强制使用代理；如果提示无法连接 Pica API，说明当前网络直连失败，请开启系统代理或加速器后重试。",14,Ui.MUTED,false));
        field(content,"name","昵称（2–50 字）",false);
        field(content,"email","用户名（1–16 位字母 / 数字 / . / _）",false);
        field(content,"password","密码（至少 9 位）",true);
        field(content,"confirmPassword","确认密码",true);
        field(content,"birthday","出生日期（YYYY-MM-DD，年满 18 岁）",false);
        gender = new Spinner(this);
        gender.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"请选择性别选项","男","女","其他"}));
        content.addView(gender);
        for(int i=1;i<=3;i++) { field(content,"question"+i,"安全问题 "+i,false); field(content,"answer"+i,"安全答案 "+i,true); }
        consent = new CheckBox(this);
        consent.setText("我已年满 18 岁，了解并将遵守第三方 Pica 服务条款，仅访问合法授权内容。注册资料发送至 Pica，Pica Library 不保存安全答案。");
        consent.setTextColor(Ui.TEXT);
        content.addView(consent);
        status = Ui.text(this,"注册成功后请返回登录；失败时会保留当前表单，方便按具体原因修改。",13,Ui.MUTED,false);
        content.addView(status);
        submit = Ui.button(this,"确认并注册",v->register(),false);
        content.addView(submit);
        setContentView(scroll);
        scroll.requestApplyInsets();
    }
    private void field(LinearLayout target,String key,String title,boolean secret) {
        target.addView(Ui.text(this,title,13,Ui.TEXT,true));
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setSaveEnabled(false);
        input.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO);
        if(secret)input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Ui.styleField(input,this);
        fields.put(key,input);
        target.addView(input);
    }
    private void register() {
        if(busy)return;
        Map<String,String> input = new LinkedHashMap<>();
        for(Map.Entry<String,EditText> entry:fields.entrySet())input.put(entry.getKey(),entry.getValue().getText().toString());
        input.put("gender",new String[]{"","m","f","bot"}[gender.getSelectedItemPosition()]);
        final Map<String,String> payload;
        try { payload=PicaRegistrationInput.validate(input,consent.isChecked(),LocalDate.now(java.time.ZoneOffset.UTC)); }
        catch(IllegalArgumentException error) { status.setText("注册失败："+error.getMessage()); return; }
        input.clear();
        busy=true;
        submit.setEnabled(false);
        back.setEnabled(false);
        status.setText("正在提交，请勿重复注册…");
        new Thread(()->{
            String message;
            boolean success=false;
            boolean retrySafe=false;
            try {
                new PicaClient(this).register(payload);
                success=true;
                message="注册成功。请返回登录并输入新账号和密码。";
            } catch(Exception error) {
                retrySafe=PicaAccountErrors.retrySafe(error);
                message="注册失败："+PicaAccountErrors.message(error)+(retrySafe?" 当前表单已保留，可修改后重新提交。":" 本次结果可能无法确认，请先返回登录尝试，不要立即重复注册。");
            } finally { payload.clear(); }
            final String result=message;
            final boolean registered=success;
            final boolean canRetry=retrySafe;
            runOnUiThread(()->{
                busy=false;
                back.setEnabled(true);
                status.setText(result);
                if(registered) {
                    for(EditText field:fields.values())field.setText("");
                    gender.setSelection(0);
                    consent.setChecked(false);
                } else if(canRetry) {
                    submit.setEnabled(true);
                }
            });
        },"pica-registration").start();
    }
    @Override public void onBackPressed() { if(!busy)super.onBackPressed(); }
}
