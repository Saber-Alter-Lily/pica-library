import java.io.*;
import java.util.*;
import javax.tools.*;
import com.sun.source.util.JavacTask;

/** Offline syntax smoke for machines without Android SDK. Does not replace assembleDebug or unit tests. */
class ParseAndroidReaderSources {
    public static void main(String[] args) throws IOException {
        if(args.length==0)throw new IllegalArgumentException("supply source paths");
        JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();
        DiagnosticCollector<JavaFileObject> messages=new DiagnosticCollector<>();
        try(StandardJavaFileManager files=compiler.getStandardFileManager(messages,Locale.ROOT,java.nio.charset.StandardCharsets.UTF_8)){
            JavacTask task=(JavacTask)compiler.getTask(null,files,messages,Arrays.asList("-proc:none","--release","8"),null,files.getJavaFileObjectsFromStrings(Arrays.asList(args)));
            int n=0;for(Object unit:task.parse())n++;
            for(Diagnostic<?> msg:messages.getDiagnostics())if(msg.getKind()==Diagnostic.Kind.ERROR)throw new AssertionError(msg);
            if(n!=args.length)throw new AssertionError("parsed "+n+" of "+args.length);
            System.out.println("PASS: parsed "+n+" Android Java source files; Android symbol resolution not tested.");
        }
    }
}
