import type { ImgHTMLAttributes } from "react";
export default function Image(props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  const { unoptimized, ...image } = props;
  void unoptimized;
  // The mobile bundle always loads official images directly, without a Next server.
  return <img {...image} alt={image.alt || ""} />;
}
