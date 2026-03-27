import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: ReactNode;
  className?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon, className }: StatCardProps) {
  return (
    <div className={cn("glass-card rounded-2xl p-5 animate-fade-in hover:shadow-elevated transition-shadow", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-display font-bold text-card-foreground mt-1 animate-count-up">{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs font-medium mt-1",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}