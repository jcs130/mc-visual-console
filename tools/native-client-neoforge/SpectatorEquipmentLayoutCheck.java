import org.mcvisual.neoforge.SpectatorEquipmentPanel;

public final class SpectatorEquipmentLayoutCheck {
    static int checks;
    static void check(boolean ok) { checks++; if (!ok) throw new AssertionError("Equipment layout " + checks); }
    public static void main(String[] args) {
        int[][] windows = {{640,360,232,68,176,222},{320,240,72,9,176,222},{280,210,52,0,176,210},
            {320,240,12,50,296,140},{320,240,0,58,320,182},{320,240,80,10,240,200}};
        for (int[] w : windows) {
            var r = SpectatorEquipmentPanel.beside(w[0],w[1],w[2],w[3],w[4],w[5]);
            check(r != null);
            int right = r.x() + r.columns()*32, bottom = r.y() + 6/r.columns()*30;
            check(r.x() >= 0 && r.y() >= 0 && right <= w[0] && bottom <= w[1]);
            check(right <= w[2] || r.x() >= w[2]+w[4] || bottom <= w[3] || r.y() >= w[3]+w[5]);
            check(r.contains(r.x(),r.y()) && !r.contains(right,bottom));
        }
        check(SpectatorEquipmentPanel.beside(320,240,0,0,320,240) == null);
        System.out.println("Spectator equipment layout: " + checks + " checks passed");
    }
}
