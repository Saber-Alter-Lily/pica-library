package com.picalibrary.android;

import java.io.IOException;
import java.util.Locale;
import org.json.JSONObject;

/** Allowlisted account diagnostics. Provider response bodies and headers are never surfaced directly. */
final class PicaAccountErrors {
    static final class RegistrationException extends IOException {
        final String field,userMessage;
        final boolean retrySafe;
        RegistrationException(String field,String userMessage,boolean retrySafe){super("PICA_REGISTER_REJECTED");this.field=field==null?"":field;this.userMessage=userMessage;this.retrySafe=retrySafe;}
    }

    static IOException registrationResponse(int status,String text) {
        if(status==429)return new IOException("PICA_ACCOUNT_RATE_LIMIT");
        if(status>=500)return new IOException("PICA_ACCOUNT_UNAVAILABLE");
        String diagnostic=extractDiagnostic(text).toLowerCase(Locale.ROOT);
        String raw=(text==null?"":text).toLowerCase(Locale.ROOT);
        String all=diagnostic+" "+raw;

        String missing=missingField(all);
        if(!missing.isEmpty())return new RegistrationException(missing,missingMessage(missing),true);
        if(has(all,"email","username","account","账号","用户名")){
            if(has(all,"exist","already","taken","duplicate","used","registered","存在","已注册","已使用","占用"))return new RegistrationException("email","该登录账号已被使用，请更换一个",true);
            if(has(all,"invalid","format","character","lowercase","wrong","非法","格式","字符"))return new RegistrationException("email","登录账号只能使用小写字母、数字和下划线",true);
        }
        if(has(all,"password","密码")){
            if(has(all,"short","length","8","invalid","weak","长度","至少","格式"))return new RegistrationException("password","密码至少 8 位，请检查后重试",true);
        }
        if(has(all,"birthday","birth","生日","age","年龄")){
            if(has(all,"18","adult","young","underage","age","年龄","成年"))return new RegistrationException("birthday","注册用户必须年满 18 岁",true);
            return new RegistrationException("birthday","出生日期不符合要求",true);
        }
        if(has(all,"gender","性别"))return new RegistrationException("gender","请选择有效的性别选项",true);
        if(has(all,"nickname","display name","name","昵称"))return new RegistrationException("name","昵称不符合要求，请使用 2–50 个字符",true);
        for(int i=1;i<=3;i++){
            if(has(all,"question"+i,"安全问题"+i,"安全问题 "+i))return new RegistrationException("question"+i,"请检查安全问题 "+i,true);
            if(has(all,"answer"+i,"安全答案"+i,"安全答案 "+i))return new RegistrationException("answer"+i,"请检查安全答案 "+i,true);
        }
        if(status>=400&&status<500)return new RegistrationException("","Pica 已拒绝本次注册请求，但没有返回可识别的具体字段",true);
        return new IOException("PICA_ACCOUNT_RESPONSE_INVALID");
    }

    static String field(Exception error){return error instanceof RegistrationException?((RegistrationException)error).field:"";}

    static String message(Exception error) {
        if(error instanceof RegistrationException)return ((RegistrationException)error).userMessage;
        if(isNetwork(error))return "无法连接 Pica API，请检查网络或代理后重试";
        String value=error.getMessage();
        if("PICA_ACCOUNT_RATE_LIMIT".equals(value))return "Pica 请求过于频繁，请稍后再试";
        if("PICA_ACCOUNT_REJECTED".equals(value))return "Pica 已拒绝本次账号请求";
        if("PICA_ACCOUNT_UNAVAILABLE".equals(value))return "Pica 账号服务暂时不可用，请稍后再试";
        if("PICA_ACCOUNT_RESPONSE_INVALID".equals(value))return "Pica 返回了无法识别的账号响应，结果尚未确认";
        return "账号请求未能确认";
    }

    static boolean retrySafe(Exception error) {
        if(error instanceof RegistrationException)return ((RegistrationException)error).retrySafe;
        if(isNetwork(error))return false;
        String value=error.getMessage();
        return "PICA_ACCOUNT_REJECTED".equals(value)||"PICA_ACCOUNT_RATE_LIMIT".equals(value)||"PICA_ACCOUNT_UNAVAILABLE".equals(value);
    }

    private static String extractDiagnostic(String text){
        if(text==null||text.trim().isEmpty())return "";
        try{
            JSONObject root=new JSONObject(text);
            StringBuilder out=new StringBuilder();
            append(out,root.optString("message",""));append(out,root.optString("error",""));append(out,root.optString("detail",""));
            Object data=root.opt("data");if(data instanceof JSONObject){JSONObject o=(JSONObject)data;append(out,o.optString("message",""));append(out,o.optString("error",""));append(out,o.optString("field",""));}
            return out.toString();
        }catch(Exception ignored){return "";}
    }
    private static void append(StringBuilder out,String value){if(value==null||value.trim().isEmpty())return;if(out.length()>0)out.append(' ');out.append(value.trim());}
    private static boolean has(String value,String...terms){for(String term:terms)if(value.contains(term.toLowerCase(Locale.ROOT)))return true;return false;}
    private static String missingField(String value){
        String[] fields={"name","email","password","birthday","gender","question1","question2","question3","answer1","answer2","answer3"};
        if(!has(value,"missing","required","empty","缺少","必填","不能为空"))return "";
        for(String field:fields)if(value.contains(field))return field;
        return "";
    }
    private static String missingMessage(String field){
        if("name".equals(field))return "请输入昵称";
        if("email".equals(field))return "请输入登录账号";
        if("password".equals(field))return "请输入密码";
        if("birthday".equals(field))return "请选择出生日期";
        if("gender".equals(field))return "请选择性别";
        if(field.startsWith("question"))return "请填写安全问题 "+field.substring(8);
        if(field.startsWith("answer"))return "请填写安全答案 "+field.substring(6);
        return "请填写必填项";
    }

    private static boolean isNetwork(Throwable error) {
        for(Throwable current=error;current!=null;current=current.getCause())if(current instanceof java.net.SocketTimeoutException||current instanceof java.net.ConnectException||current instanceof java.net.UnknownHostException||current instanceof javax.net.ssl.SSLException)return true;
        return false;
    }
}
