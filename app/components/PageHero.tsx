import { ElementType } from "react";

interface PageHeroProps {
  icon: ElementType;
  title: string;
  subtitle?: string;
  iconColor?: string;
  iconBg?: string;
  className?: string;
}

export default function PageHero({
  icon: Icon,
  title,
  subtitle,
  iconColor = "text-main",
  iconBg = "bg-orange-100",
  className = "mt-8 mb-8",
}: PageHeroProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={`size-16 rounded-full flex items-center justify-center ${iconBg}`}>
        <Icon size={30} className={iconColor} />
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-foreground">{title}</p>
        {subtitle && <p className="text-sm text-foreground-muted mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
