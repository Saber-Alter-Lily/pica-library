package com.picalibrary.android;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Pure validation. Passwords and answers are never normalized or persisted. */
final class PicaRegistrationInput {
    private static final Pattern NEW_USERNAME = Pattern.compile("^[A-Za-z0-9._]{1,16}$");

    static Map<String,String> validate(Map<String,String> input, boolean accepted, LocalDate today) {
        if (!accepted) throw new IllegalArgumentException("请确认年龄要求和第三方服务说明");
        Map<String,String> out = new LinkedHashMap<>();
        out.put("name", value(input,"name",2,50,true));
        String username = value(input,"email",1,16,true);
        if(!NEW_USERNAME.matcher(username).matches()) throw new IllegalArgumentException("用户名应为 1–16 位字母、数字、点或下划线");
        out.put("email", username);
        String password = value(input,"password",8,128,false);
        if (!password.equals(input.get("confirmPassword"))) throw new IllegalArgumentException("两次密码不一致");
        out.put("password",password);
        String birthday = value(input,"birthday",10,10,true);
        try {
            LocalDate born = LocalDate.parse(birthday);
            int age = today.getYear() - born.getYear();
            if (today.getMonthValue() < born.getMonthValue() ||
                    (today.getMonthValue() == born.getMonthValue() && today.getDayOfMonth() < born.getDayOfMonth())) age--;
            if (age < 18) throw new IllegalArgumentException("此服务仅限年满 18 岁用户注册");
        } catch (DateTimeParseException e) { throw new IllegalArgumentException("出生日期格式应为 YYYY-MM-DD"); }
        out.put("birthday",birthday);
        String gender = input.get("gender");
        if (!"m".equals(gender) && !"f".equals(gender) && !"bot".equals(gender)) throw new IllegalArgumentException("请选择性别选项");
        out.put("gender",gender);
        for (int i=1;i<=3;i++) {
            out.put("question"+i,value(input,"question"+i,1,200,true));
            out.put("answer"+i,value(input,"answer"+i,1,200,false));
        }
        return out;
    }
    private static String value(Map<String,String> input,String key,int min,int max,boolean trim) {
        String value = input.get(key);
        if(value==null)value="";
        if(trim)value=value.trim();
        if(value.length()<min || value.length()>max || value.matches("(?s).*[\\x00-\\x1f].*"))
            throw new IllegalArgumentException("注册字段不完整或格式错误："+key);
        return value;
    }
}
