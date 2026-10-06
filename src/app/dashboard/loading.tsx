export default function Loading() {
  return (
    <main id="main" className="container dashboard-main" role="status">
      <p>Chargement de ton tableau de bord…</p>
      <div className="chart-panel skeleton" style={{ height: 400 }} />
    </main>
  );
}
