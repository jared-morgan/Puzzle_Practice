// Writes src/puzzles/swordfight/sword-parity.json from the game's own Swordfight code:
//   settle   random pairs dropped onto a board, then the board settled the way the game's
//            does it (drop/a/f falling with sword/a/l, sword/a/e joining, sword/a/a clearing),
//            with the board after every step
//   strikes  sword/a/i placing incoming strikes when the pair appears, then again as they land
//   sprinkles  sword/a/i spreading sprinkles over the columns
//   swords   item/data/Sword's colour for every square of every sword pattern and colouring
//   turns    DropBoard.getForgivingRotation and getForgivingMove on random boards
// board.test.ts and strikes.test.ts replay the same inputs on the TypeScript port.
//
// Build 20260909165753. From D:\Documents\PP_Clone (Git Bash):
//   JB=tools/jdk21/jdk-21.0.12.1+1/bin; CP=<the game's main code jar>
//   "$JB/javac.exe" -cp $CP -d /tmp/sp work/pp-swordfight/scripts/parity/SwordParity.java
//   "$JB/java.exe" -cp "$CP;/tmp/sp" SwordParity > work/pp-swordfight/src/puzzles/swordfight/sword-parity.json
// The game's sword/a package shares its name with a class, which javac can't refer to, so its
// classes are reached by reflection.
import com.threerings.piracy.item.data.Sword;
import com.threerings.piracy.puzzle.sword.data.ShaftInfo;
import com.threerings.piracy.puzzle.sword.data.StrikeInfo;
import com.threerings.piracy.puzzle.sword.data.SwordBoard;
import com.threerings.puzzle.drop.data.DropBoard;
import java.lang.reflect.*;
import java.util.*;

public class SwordParity {
  static final String PKG = "com.threerings.piracy.puzzle.sword.a.";
  static Object gravity, clearer, placer;
  static Method fallM, joinM, clearM, placeM, replaceM, sprinkleM;

  static Object make(String cls, Class<?>[] types, Object... args) throws Exception {
    Constructor<?> c = Class.forName(cls).getDeclaredConstructor(types);
    c.setAccessible(true);
    return c.newInstance(args);
  }

  static Method method(Class<?> c, String name, Class<?>... types) throws Exception {
    Method m = c.getDeclaredMethod(name, types);
    m.setAccessible(true);
    return m;
  }

  static Object field(Object o, String name) throws Exception {
    Field f = o.getClass().getDeclaredField(name);
    f.setAccessible(true);
    return f.get(o);
  }

  static String cells(SwordBoard b) {
    return Arrays.toString(b.getBoard()).replace(" ", "");
  }

  static SwordBoard board(Random r) {
    SwordBoard b = new SwordBoard(6, 13);
    b.initializeSeed(r.nextLong());
    return b;
  }

  static int colours = 4;

  static int piece(Random r, int breakerOneIn) {
    int c = r.nextInt(colours);
    return r.nextInt(breakerOneIn) == 0 ? c | 128 : c;
  }

  /** Drops a pair straight down in a random column and orientation, like a placed pair. */
  static void dropPair(SwordBoard b, Random r, int breakerOneIn) {
    int x = r.nextInt(6);
    boolean upright = r.nextBoolean() || x == 5;
    int p0 = piece(r, breakerOneIn), p1 = piece(r, breakerOneIn);
    if (upright) {
      int y = b.getDropDistance(x, -1) - 1;
      if (y >= 0) b.setPiece(x, y, p0);
      if (y - 1 >= 0) b.setPiece(x, y - 1, p1);
    } else {
      int y = Math.min(b.getDropDistance(x, -1), b.getDropDistance(x + 1, -1)) - 1;
      if (y >= 0) { b.setPiece(x, y, p0); b.setPiece(x + 1, y, p1); }
    }
  }

  /** One evolve step as s.o() does it: fall, else join, else clear. Returns the kind, or null when settled. */
  static String step(SwordBoard b, int[] chain) throws Exception {
    int moved = (Integer) fallM.invoke(gravity, b, null);
    if (moved > 0) return "fall";
    @SuppressWarnings("unchecked")
    List<Object> blocks = (List<Object>) joinM.invoke(null, b);
    if (blocks != null) {
      for (Object blk : blocks) {
        b.setBlock((Integer) field(blk, "a"), (Integer) field(blk, "b"), (Integer) field(blk, "c"), (Integer) field(blk, "d"), (Integer) field(blk, "e"), null);
      }
      return "join";
    }
    Object result = clearM.invoke(clearer, b, chain[0]);
    @SuppressWarnings("unchecked")
    List<Object> cleared = (List<Object>) field(result, "b");
    if (cleared.isEmpty()) return null;
    for (Object d : cleared) b.setPiece((Integer) field(d, "a"), (Integer) field(d, "b"), -1);
    chain[0]++;
    return "clear:" + field(result, "a") + ":" + ((List<?>) field(result, "c")).size();
  }

  static String strikes(List<StrikeInfo> list) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < list.size(); i++) {
      StrikeInfo s = list.get(i);
      if (i > 0) sb.append(',');
      sb.append("{\"id\":").append(s.strikeid).append(",\"w\":").append(s.width).append(",\"h\":").append(s.height)
        .append(",\"x\":").append(s.x).append(",\"y\":").append(s.y).append(",\"orient\":").append(s.orient).append(",\"pieces\":");
      if (s.pieces == null) { sb.append("null}"); continue; }
      sb.append('[');
      for (int c = 0; c < s.pieces.length; c++) {
        if (c > 0) sb.append(',');
        sb.append(s.pieces[c] == null ? "null" : Arrays.toString(s.pieces[c]).replace(" ", ""));
      }
      sb.append("]}");
    }
    return sb.append(']').toString();
  }

  public static void main(String[] a) throws Exception {
    Class<?> lc = Class.forName(PKG + "l");
    Object rules = make(PKG + "l", new Class<?>[0]);
    gravity = make("com.threerings.puzzle.drop.a.f", new Class<?>[]{Class.forName("com.threerings.puzzle.drop.a.e")}, rules);
    fallM = method(gravity.getClass(), "b", DropBoard.class, Class.forName("com.threerings.puzzle.drop.a.g"));
    joinM = method(Class.forName(PKG + "e"), "a", SwordBoard.class);
    clearer = make(PKG + "a", new Class<?>[0]);
    clearM = method(clearer.getClass(), "a", SwordBoard.class, int.class);
    placer = make(PKG + "i", new Class<?>[0]);
    placeM = method(placer.getClass(), "a", SwordBoard.class, Sword.class, List.class);
    replaceM = method(placer.getClass(), "b", SwordBoard.class, Sword.class, List.class);
    sprinkleM = method(placer.getClass(), "a", int.class, int.class, byte[].class, ShaftInfo.class);

    StringBuilder out = new StringBuilder("{\"settle\":[");
    Random r = new Random(20261006L);
    for (int game = 0; game < 36; game++) {
      SwordBoard b = board(r);
      int breakerOneIn = 3 + r.nextInt(8);
      // Fewer colours in some games, so more blocks fuse.
      colours = 2 + r.nextInt(3);
      out.append(game > 0 ? "," : "").append("[");
      for (int turn = 0; turn < 30; turn++) {
        if (b.getPiece(3, 0) != -1) break;
        b.updateStrikePieces(null);
        dropPair(b, r, breakerOneIn);
        out.append(turn > 0 ? "," : "").append("{\"start\":").append(cells(b)).append(",\"steps\":[");
        int[] chain = {0};
        boolean first = true;
        for (int guard = 0; guard < 100; guard++) {
          String kind = step(b, chain);
          if (kind == null) break;
          out.append(first ? "" : ",").append("{\"kind\":\"").append(kind).append("\",\"board\":").append(cells(b)).append("}");
          first = false;
        }
        out.append("]}");
      }
      out.append("]");
    }

    colours = 3;
    out.append("],\"strikes\":[");
    for (int n = 0; n < 150; n++) {
      SwordBoard b = board(r);
      int pairs = r.nextInt(25);
      for (int k = 0; k < pairs; k++) {
        dropPair(b, r, 6);
        int[] chain = {0};
        for (int guard = 0; guard < 100 && step(b, chain) != null; guard++) {}
      }
      int type = r.nextInt(5) == 0 ? 127 : r.nextInt(26);
      Sword sword = new Sword((byte) type, (byte) r.nextInt(8), (byte) r.nextInt(8));
      List<StrikeInfo> list = new ArrayList<>();
      int count = 1 + r.nextInt(3);
      for (int k = 0; k < count; k++) {
        boolean flat = r.nextBoolean();
        int w = flat ? 2 + r.nextInt(6) : 1 + r.nextInt(3);
        int h = flat ? 2 + r.nextInt(2) : 3 + r.nextInt(9);
        if (flat && w <= h) w = h + 1;
        list.add(new StrikeInfo(r.nextInt(256), (byte) w, (byte) h));
      }
      String before = cells(b);
      String asked = strikes(list);
      @SuppressWarnings("unchecked")
      List<StrikeInfo> placed = new ArrayList<>((List<StrikeInfo>) placeM.invoke(placer, b, sword, list));
      String atSpawn = strikes(placed);
      // The pair lands somewhere first, as it would before the attack comes in.
      b.updateStrikePieces(null);
      dropPair(b, r, 6);
      int[] chain = {0};
      for (int guard = 0; guard < 100 && step(b, chain) != null; guard++) {}
      String landingBoard = cells(b);
      replaceM.invoke(placer, b, sword, placed);
      out.append(n > 0 ? "," : "").append("{\"board\":").append(before).append(",\"sword\":[").append(type).append(',')
        .append(sword.variation / 8).append(',').append(sword.variation % 8).append("],\"asked\":").append(asked)
        .append(",\"placed\":").append(atSpawn).append(",\"landingBoard\":").append(landingBoard)
        .append(",\"landed\":").append(strikes(placed)).append("}");
    }

    out.append("],\"sprinkles\":[");
    for (int n = 0; n < 60; n++) {
      byte[] levels = new byte[6];
      for (int c = 0; c < 6; c++) levels[c] = (byte) r.nextInt(14);
      ShaftInfo shaft = new ShaftInfo(1, (byte) r.nextInt(256));
      shaft.count = (byte) r.nextInt(40);
      String before = Arrays.toString(levels).replace(" ", "");
      byte[] added = (byte[]) sprinkleM.invoke(placer, 6, 13, levels, shaft);
      out.append(n > 0 ? "," : "").append("{\"levels\":").append(before).append(",\"count\":").append(shaft.count)
        .append(",\"shaft\":").append(shaft.shaftid & 0xff).append(",\"added\":").append(Arrays.toString(added).replace(" ", "")).append("}");
    }

    out.append("],\"swords\":[");
    boolean firstSword = true;
    int[] types = new int[27];
    for (int t = 0; t < 26; t++) types[t] = t;
    types[26] = 127;
    for (int t : types) {
      for (int v = 0; v < 64; v += 5) {
        Sword sword = new Sword((byte) t, (byte) (v / 8), (byte) (v % 8));
        StringBuilder strike = new StringBuilder("[");
        for (int y = 0; y < 12; y++) {
          if (y > 0) strike.append(',');
          strike.append('[');
          for (int x = 0; x < 6; x++) strike.append(x > 0 ? "," : "").append(sword.getShaftPiece(x, y, true));
          strike.append(']');
        }
        StringBuilder sprinkle = new StringBuilder("[");
        for (int y = 0; y < 4; y++) {
          if (y > 0) sprinkle.append(',');
          sprinkle.append('[');
          for (int x = 0; x < 6; x++) sprinkle.append(x > 0 ? "," : "").append(sword.getShaftPiece(x, y, false));
          sprinkle.append(']');
        }
        out.append(firstSword ? "" : ",").append("{\"sword\":[").append(t).append(',').append(v / 8).append(',').append(v % 8)
          .append("],\"strike\":").append(strike.append(']')).append(",\"sprinkle\":").append(sprinkle.append(']')).append('}');
        firstSword = false;
      }
    }

    out.append("],\"turns\":[");
    for (int n = 0; n < 300; n++) {
      SwordBoard b = board(r);
      int pairs = r.nextInt(30);
      for (int k = 0; k < pairs; k++) dropPair(b, r, 100);
      int col = r.nextInt(6), row = r.nextInt(14) - 1, orient = 1 + 2 * r.nextInt(4);
      int[] rows = {row, orient == 3 ? row - 1 : orient == 7 ? row + 1 : row};
      int[] cols = {col, orient == 1 ? col - 1 : orient == 5 ? col + 1 : col};
      float progress = r.nextInt(3) == 0 ? 0f : r.nextFloat();
      boolean kick = r.nextBoolean();
      int dir = r.nextInt(2);
      int[] turned = b.getForgivingRotation(rows, cols, orient, dir, 0, progress, kick);
      int x = Math.min(cols[0], cols[1]), y = Math.max(rows[0], rows[1]);
      int w = cols[0] == cols[1] ? 1 : 2, h = rows[0] == rows[1] ? 1 : 2;
      int dx = r.nextBoolean() ? 1 : -1;
      java.awt.Point moved = b.getForgivingMove(x, y, w, h, dx, 0, progress);
      out.append(n > 0 ? "," : "").append("{\"board\":").append(cells(b)).append(",\"col\":").append(col).append(",\"row\":").append(row)
        .append(",\"orient\":").append(orient).append(",\"progress\":").append(progress).append(",\"kick\":").append(kick)
        .append(",\"clockwise\":").append(dir == 1).append(",\"turned\":").append(turned == null ? "null" : Arrays.toString(turned).replace(" ", ""))
        .append(",\"dx\":").append(dx).append(",\"moved\":").append(moved != null).append('}');
    }
    System.out.println(out.append("]}"));
  }
}
