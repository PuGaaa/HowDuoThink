import java.util.regex.Pattern;

/** 工兵篇正则题的受限语义复核。运行：java content/baselines/t04b-engineer-regex-repro.java
 * 仅对512~4096长度各采一次，不拟合复杂度、不报告p95/p99。JDK版本影响优化和耗时。 */
class EngineerRegexRepro {
 public static void main(String[] args) {
  Pattern nested = Pattern.compile("^(a+)+$");
  Pattern linear = Pattern.compile("^a+$");
  for (int k=0;k<200;k++) nested.matcher("a".repeat(100)+"!").matches();
  for (int n : new int[]{512,1024,2048,4096}) {
   String bad = "a".repeat(n)+"!";
   long start = System.nanoTime();
   boolean actual = nested.matcher(bad).matches();
   double elapsed = (System.nanoTime()-start)/1e6;
   if (actual || linear.matcher(bad).matches()) throw new AssertionError("非法后缀应被拒绝");
   if (!nested.matcher("a".repeat(n)).matches() || !linear.matcher("a".repeat(n)).matches()) throw new AssertionError("合法串应被接受");
   System.out.printf("n=%d match=%s elapsed_ms=%.3f%n",n,actual,elapsed);
  }
  if (Pattern.compile("^\\w+").matcher("限时！！！%¥#…").find()) throw new AssertionError("默认Java \\w不应从中文开头匹配");
  System.out.println("PASS：合法/非法输入语义一致；旧中文输入不能进入该\\w模式的深回溯。");
 }
}
