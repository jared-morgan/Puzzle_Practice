import com.threerings.piracy.puzzle.crafting.brew.data.BrewBoard;
import java.lang.reflect.Field;
import java.util.*;

public class BrewParity {
  static byte[][] cols(BrewBoard b) throws Exception {
    Field f = BrewBoard.class.getDeclaredField("_board"); f.setAccessible(true); return (byte[][]) f.get(b);
  }
  static String dump(byte[][] c) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < c.length; i++) { if (i > 0) sb.append(','); sb.append(Arrays.toString(c[i]).replace(" ", "")); }
    return sb.append(']').toString();
  }
  public static void main(String[] a) throws Exception {
    StringBuilder out = new StringBuilder("[");
    long[] seeds = {0L, 1L, 42L, 123456789L, -7L, 281474976710655L};
    for (int s = 0; s < seeds.length; s++) {
      BrewBoard b = new BrewBoard();
      b.initializeSeed(seeds[s]);
      Random moves = new Random(seeds[s] + 99);
      out.append(s > 0 ? "," : "").append("{\"seed\":\"").append(seeds[s]).append("\",\"start\":").append(dump(cols(b))).append(",\"steps\":[");
      for (int step = 0; step < 30; step++) {
        // a few random legal swaps, then burn
        List<int[]> swaps = new ArrayList<>();
        for (int k = 0; k < 40; k++) {
          int x = moves.nextInt(9); byte[][] c = cols(b); int y = moves.nextInt(c[x].length);
          int y2 = moves.nextInt(c[x+1].length);
          if (b.swap(x, y, x + 1, y2)) swaps.add(new int[]{x, y, x + 1, y2});
        }
        int[] r = new int[6];
        boolean ok = b.scoreRightColumn(r);
        b.addNextColumn();
        out.append(step > 0 ? "," : "").append("{\"swaps\":[");
        for (int i = 0; i < swaps.size(); i++) out.append(i > 0 ? "," : "").append(Arrays.toString(swaps.get(i)).replace(" ", ""));
        out.append("],\"distilled\":").append(ok).append(",\"r\":").append(Arrays.toString(r).replace(" ", "")).append(",\"board\":").append(dump(cols(b))).append("}");
      }
      out.append("]}");
    }
    System.out.println(out.append("]"));
  }
}
