import Image from "next/image";

export function InkScene() {
  return (
    <div className="ink-scene" aria-hidden="true">
      <div className="ink-sun" />
      <div className="ink-cloud ink-cloud-one" />
      <div className="ink-cloud ink-cloud-two" />
      <Image
        className="qitong-figure"
        src="/qitong.webp"
        alt=""
        width={280}
        height={420}
        priority
      />
    </div>
  );
}
