package com.picalibrary.android;

import org.junit.Test;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.Assert.*;

public class PicaRegistrationInputTest {
    private Map<String,String> fixture(){Map<String,String> input=new LinkedHashMap<>();input.put("name"," Demo ");input.put("email","demo_reader");input.put("password"," fixture-password ");input.put("confirmPassword"," fixture-password ");input.put("birthday","2000-02-29");input.put("gender","bot");for(int i=1;i<=3;i++){input.put("question"+i," Demo question ");input.put("answer"+i," answer ");}return input;}

    @Test public void acceptsLowercaseUsernameAndPreservesSecrets(){Map<String,String> out=PicaRegistrationInput.validate(fixture(),true,LocalDate.of(2026,9,13));assertEquals("demo_reader",out.get("email"));assertEquals("Demo",out.get("name"));assertEquals(" fixture-password ",out.get("password"));assertEquals(" answer ",out.get("answer1"));assertFalse(out.containsKey("confirmPassword"));assertEquals(11,out.size());}

    @Test public void usernameAndPasswordMatchCurrentClientContract(){
        Map<String,String> valid=fixture();valid.put("email","reader01_");valid.put("password","12345678");valid.put("confirmPassword","12345678");assertEquals("reader01_",PicaRegistrationInput.validate(valid,true,LocalDate.of(2026,9,13)).get("email"));
        for(String username:new String[]{"Reader01","reader.01","reader-name","reader@name"}){Map<String,String> invalid=fixture();invalid.put("email",username);PicaRegistrationInput.ValidationException error=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(invalid,true,LocalDate.of(2026,9,13)));assertEquals("email",error.field);}
        Map<String,String> tooShort=fixture();tooShort.put("password","1234567");tooShort.put("confirmPassword","1234567");PicaRegistrationInput.ValidationException shortError=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(tooShort,true,LocalDate.of(2026,9,13)));assertEquals("password",shortError.field);
    }

    @Test public void validationIdentifiesTheExactField(){Map<String,String> missing=fixture();missing.put("question2","");PicaRegistrationInput.ValidationException error=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(missing,true,LocalDate.of(2026,9,13)));assertEquals("question2",error.field);assertTrue(error.getMessage().contains("安全问题 2"));}
    @Test public void rejectsMissingConsent(){PicaRegistrationInput.ValidationException error=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(fixture(),false,LocalDate.now()));assertEquals("consent",error.field);}
    @Test public void rejectsMismatchedPasswordWithoutEchoingIt(){Map<String,String> input=fixture();input.put("confirmPassword","wrong-secret");PicaRegistrationInput.ValidationException error=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(input,true,LocalDate.now()));assertEquals("confirmPassword",error.field);assertFalse(error.getMessage().contains("secret"));}
    @Test public void leapDayAgeMatchesMonthDayBoundary(){Map<String,String> input=fixture();input.put("birthday","2008-02-29");assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(input,true,LocalDate.of(2026,2,28)));assertEquals("2008-02-29",PicaRegistrationInput.validate(input,true,LocalDate.of(2026,3,1)).get("birthday"));}
    @Test public void rejectsInvalidDatesAndControlCharacters(){Map<String,String> input=fixture();input.put("birthday","2001-02-29");PicaRegistrationInput.ValidationException date=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(input,true,LocalDate.now()));assertEquals("birthday",date.field);input.put("birthday","2000-02-29");input.put("answer1","bad\nanswer");PicaRegistrationInput.ValidationException answer=assertThrows(PicaRegistrationInput.ValidationException.class,()->PicaRegistrationInput.validate(input,true,LocalDate.now()));assertEquals("answer1",answer.field);}

    @Test public void classifiesServerRegistrationErrorsWithoutEchoingBodies(){
        Exception exists=PicaAccountErrors.registrationResponse(400,"{\"message\":\"Email already exists: secret@example.com\"}");assertEquals("email",PicaAccountErrors.field(exists));assertTrue(PicaAccountErrors.message(exists).contains("已被使用"));assertFalse(PicaAccountErrors.message(exists).contains("secret@example.com"));assertTrue(PicaAccountErrors.retrySafe(exists));
        Exception missing=PicaAccountErrors.registrationResponse(400,"{\"message\":\"Missing field: answer2\"}");assertEquals("answer2",PicaAccountErrors.field(missing));assertTrue(PicaAccountErrors.message(missing).contains("安全答案 2"));
        Exception unknown=PicaAccountErrors.registrationResponse(400,"{\"message\":\"opaque provider rejection token=super-secret\"}");assertEquals("",PicaAccountErrors.field(unknown));assertFalse(PicaAccountErrors.message(unknown).contains("super-secret"));
        assertTrue(PicaAccountErrors.message(new java.net.SocketTimeoutException()).contains("无法连接"));assertFalse(PicaAccountErrors.retrySafe(new java.net.SocketTimeoutException()));assertFalse(PicaAccountErrors.retrySafe(new Exception("PICA_ACCOUNT_RESPONSE_INVALID")));
    }
}
