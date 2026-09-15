package com.picalibrary.android;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Pure registration validation. Secrets are never normalized, persisted or echoed in errors. */
final class PicaRegistrationInput {
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_]+$");
    private static final int USERNAME_SAFETY_MAX = 64;

    static final class ValidationException extends IllegalArgumentException {
        final String field;
        ValidationException(String field,String message){super(message);this.field=field==null?"":field;}
    }

    static Map<String,String> validate(Map<String,String> input, boolean accepted, LocalDate today) {
        if (!accepted) fail("consent","请确认已年满 18 岁并同意 Pica 服务条款");
        Map<String,String> out = new LinkedHashMap<>();

        String name=trimmed(input,"name");
        if(name.length()<2||name.length()>50)fail("name","昵称需要 2–50 个字符");
        rejectControl("name",name,"昵称包含不支持的字符");
        out.put("name",name);

        String username=trimmed(input,"email");
        if(username.isEmpty())fail("email","请输入登录账号");
        if(username.length()>USERNAME_SAFETY_MAX)fail("email","登录账号过长");
        if(!USERNAME.matcher(username).matches())fail("email","登录账号只能使用小写字母、数字和下划线");
        out.put("email",username);

        String password=raw(input,"password");
        if(password.length()<8)fail("password","密码至少 8 位");
        if(password.length()>128)fail("password","密码过长");
        rejectControl("password",password,"密码包含不支持的控制字符");
        String confirm=raw(input,"confirmPassword");
        if(!password.equals(confirm))fail("confirmPassword","两次输入的密码不一致");
        out.put("password",password);

        String birthday=trimmed(input,"birthday");
        LocalDate born;
        try { born=LocalDate.parse(birthday); }
        catch(DateTimeParseException error){throw new ValidationException("birthday","出生日期格式应为 YYYY-MM-DD");}
        if(born.isAfter(today))fail("birthday","出生日期不能晚于今天");
        int age=today.getYear()-born.getYear();
        if(today.getMonthValue()<born.getMonthValue()||(today.getMonthValue()==born.getMonthValue()&&today.getDayOfMonth()<born.getDayOfMonth()))age--;
        if(age<18)fail("birthday","注册用户必须年满 18 岁");
        out.put("birthday",birthday);

        String gender=raw(input,"gender");
        if(!"m".equals(gender)&&!"f".equals(gender)&&!"bot".equals(gender))fail("gender","请选择性别");
        out.put("gender",gender);

        for(int i=1;i<=3;i++){
            String questionKey="question"+i,answerKey="answer"+i;
            String question=trimmed(input,questionKey);
            if(question.isEmpty())fail(questionKey,"请填写安全问题 "+i);
            if(question.length()>200)fail(questionKey,"安全问题 "+i+" 过长");
            rejectControl(questionKey,question,"安全问题 "+i+" 包含不支持的字符");
            String answer=raw(input,answerKey);
            if(answer.isEmpty())fail(answerKey,"请填写安全答案 "+i);
            if(answer.length()>200)fail(answerKey,"安全答案 "+i+" 过长");
            rejectControl(answerKey,answer,"安全答案 "+i+" 包含不支持的控制字符");
            out.put(questionKey,question);
            out.put(answerKey,answer);
        }
        return out;
    }

    private static String raw(Map<String,String> input,String key){String value=input.get(key);return value==null?"":value;}
    private static String trimmed(Map<String,String> input,String key){return raw(input,key).trim();}
    private static void rejectControl(String field,String value,String message){if(value.matches("(?s).*[\\x00-\\x1f].*"))fail(field,message);}
    private static void fail(String field,String message){throw new ValidationException(field,message);}
}
