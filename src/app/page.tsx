import Image from "next/image";

export default function Home() {

  return (
    <div className="">
      <h1>esta es una prueba de planos en 2d</h1>
      <a href="/plano"> PLANO</a>
      <a
        href="/editor"
        className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium transition hover:bg-blue-700"
      >
        Abrir Editor 2D/3D
      </a>
    </div>
  );
}
