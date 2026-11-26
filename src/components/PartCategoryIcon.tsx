import type { ComponentCategory } from "@/lib/drafts";

type ConfigurableCategory = Exclude<ComponentCategory, "other">;

export default function PartCategoryIcon({
  category,
  className,
}: {
  category: ConfigurableCategory;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 160 116" fill="none" aria-hidden="true" focusable="false">
      {category === "cpu" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="42" y="19" width="76" height="76" rx="11" fill="#143246" />
        <rect x="57" y="34" width="46" height="46" rx="7" fill="#57cfc2" fillOpacity=".17" />
        <rect x="68" y="45" width="24" height="24" rx="4" fill="#7de2d7" fillOpacity=".4" />
        <path d="M57 9v10m23-10v10m23-10v10M57 95v11m23-11v11m23-11v11M32 39h10m-10 24h10m-10 24h10m76-48h10m-10 24h10m-10 24h10" />
      </g> : null}

      {category === "motherboard" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 12h89l9 10v75l-12 8H32l-10-11V22z" fill="#143246" />
        <rect x="54" y="26" width="39" height="37" rx="4" fill="#57cfc2" fillOpacity=".18" />
        <rect x="64" y="35" width="19" height="19" rx="3" />
        <path d="M101 25v46m9-46v46m-9-36h9m-9 12h9m-9 12h9M41 77h76m-76 10h52" />
        <circle cx="39" cy="28" r="3" /><circle cx="119" cy="88" r="3" />
      </g> : null}

      {category === "memory" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="57" y="9" width="46" height="91" rx="8" fill="#143246" />
        <rect x="65" y="19" width="30" height="14" rx="3" fill="#57cfc2" fillOpacity=".24" />
        <rect x="65" y="40" width="30" height="14" rx="3" fill="#57cfc2" fillOpacity=".24" />
        <rect x="65" y="61" width="30" height="14" rx="3" fill="#57cfc2" fillOpacity=".24" />
        <path d="M65 89v8m8-8v8m8-8v8m8-8v8m8-8v8" />
      </g> : null}

      {category === "gpu" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 32h116a8 8 0 0 1 8 8v39a8 8 0 0 1-8 8H17z" fill="#143246" />
        <path d="M141 47h8v26h-8M26 87v8m13-8v8m13-8v8m13-8v8m13-8v8m13-8v8m13-8v8m13-8v8" />
        {[43, 81, 119].map((x) => <g key={x}>
          <circle cx={x} cy="59.5" r="15" fill="#57cfc2" fillOpacity=".14" />
          <circle cx={x} cy="59.5" r="4" fill="#7de2d7" fillOpacity=".55" />
          <path d={`M${x} 46v9m11 4h-8m-3 13v-9m-11-4h8`} />
        </g>)}
      </g> : null}

      {category === "storage" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="25" y="17" width="110" height="82" rx="12" fill="#143246" />
        <rect x="43" y="31" width="62" height="42" rx="6" fill="#57cfc2" fillOpacity=".17" />
        <path d="M52 82h55m-43-39 17 18m-6-18L58 61" />
        <circle cx="37" cy="29" r="3" /><circle cx="123" cy="29" r="3" /><circle cx="37" cy="87" r="3" /><circle cx="123" cy="87" r="3" />
      </g> : null}

      {category === "psu" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="34" y="13" width="92" height="90" rx="10" fill="#143246" />
        <circle cx="80" cy="56" r="28" fill="#57cfc2" fillOpacity=".11" />
        <circle cx="80" cy="56" r="7" />
        <circle cx="80" cy="56" r="19" />
        <path d="m80 37 4 12m15 7-12 4m-7 15-4-12m-15-7 12-4m39 27h-8m-40 0h-8" />
      </g> : null}

      {category === "case" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="48" y="8" width="64" height="100" rx="10" fill="#143246" />
        <rect x="57" y="17" width="39" height="81" rx="5" fill="#57cfc2" fillOpacity=".12" />
        <path d="M102 20v75m-39-8h20" />
        <circle cx="77" cy="40" r="12" /><circle cx="77" cy="70" r="12" /><circle cx="77" cy="40" r="3" fill="#7de2d7" /><circle cx="77" cy="70" r="3" fill="#7de2d7" />
      </g> : null}

      {category === "cooling" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 91h100M41 81V31h44v50M48 37h30m-30 9h30m-30 9h30m-30 9h30m-30 9h30" />
        <circle cx="108" cy="53" r="25" fill="#57cfc2" fillOpacity=".13" />
        <circle cx="108" cy="53" r="6" />
        <path d="M108 29v18m21 6h-17m-4 24V59m-21-6h17m-44 30v10m10-10v10m10-10v10" />
      </g> : null}
    </svg>
  );
}
