import { ChevronDown } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

/** Native disclosure accordion: keyboard and screen-reader friendly without any state. */
export function Faq({ items }: { items: FaqItem[] }): React.JSX.Element {
  return (
    <div className="divide-y divide-[color:var(--iris-border-soft)] border-y border-[color:var(--iris-border-soft)]">
      {items.map((item, index) => (
        <details key={item.q} open={index === 0} className="group">
          <summary className="iris-focusable flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium tracking-[-0.2px] [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown
              aria-hidden
              className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)] transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <p className="animate-iris-rise pb-5 pr-8 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
