export type PrizeKind = "phone" | "car" | "jewelry" | "laptop" | "prize";
export function prizeKind(title = ""): PrizeKind {
  if (/iphone|phone|galaxy/i.test(title)) return "phone";
  if (/macbook|laptop|notebook/i.test(title)) return "laptop";
  if (/corolla|toyota|vehicle|\bcar\b/i.test(title)) return "car";
  if (/necklace|bracelet|jewel|ring\b/i.test(title)) return "jewelry";
  return "prize";
}
export function prizeCategory(title: string) {
  const kind = prizeKind(title);
  return kind === "phone" || kind === "laptop" ? "Tech" : kind === "car" ? "Cars" : kind === "jewelry" ? "Jewelry" : "The collection";
}
export function PrizeArt({ kind = "phone" }: { kind?: PrizeKind }) {
  return <div className={`prize-art kind-${kind}`} role="img" aria-label={`${kind === "prize" ? "Prize" : kind} illustration, not a photograph of the actual prize`}>
    {kind === "phone" ? <div className="art-devices" aria-hidden="true"><div className="art-phone art-phone-back"><div className="art-cameras"><i /><i /><i /></div><span className="art-device-mark">e</span></div><div className="art-phone art-phone-front"><div className="art-island" /><span>hello.</span></div></div> :
      kind === "car" ? <div className="art-car" aria-hidden="true"><div className="art-car-top" /><div className="art-car-body" /><i className="art-wheel art-wheel-one" /><i className="art-wheel art-wheel-two" /></div> :
      kind === "jewelry" ? <div className="art-jewels" aria-hidden="true"><div className="art-jewel art-jewel-one" /><div className="art-jewel art-jewel-two" /></div> :
      kind === "laptop" ? <div className="art-laptop" aria-hidden="true"><div className="art-laptop-screen"><span>possibility.</span></div><div className="art-laptop-base" /></div> : <span className="art-generic" aria-hidden="true">e.</span>}
    <span className="art-caption">Illustration</span>
  </div>;
}
