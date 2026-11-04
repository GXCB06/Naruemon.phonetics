import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="text-6xl" aria-hidden>
        🐦‍⬛
      </div>
      <h1 className="text-4xl font-black tracking-tight">Myna</h1>
      <p className="text-lg text-muted">
        Practise English intonation. Say a sentence or draw its tune, and see how close you are to the textbook pattern.
      </p>
      <p className="thai text-muted">ฝึกทำนองเสียงภาษาอังกฤษ พูดหรือวาดเส้นทำนอง แล้วดูว่าใกล้เคียงรูปแบบในตำราแค่ไหน</p>
      <Link href="/lab" className="btn btn-primary text-lg">
        Open the Phase 0a lab →
      </Link>
      <p className="text-sm text-muted">Phase 0a test page: rule engine, recorder, pitch tracking and drawing quiz.</p>
    </main>
  );
}
