import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const severityVariants: Record<string, string> = {
  CRITICAL: "bg-red-600 hover:bg-red-600 text-white",
  HIGH: "bg-orange-500 hover:bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 hover:bg-yellow-500 text-black",
  LOW: "bg-blue-500 hover:bg-blue-500 text-white",
  INFO: "bg-gray-400 hover:bg-gray-400 text-white",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge className={cn("text-xs", severityVariants[severity])}>
      {severity}
    </Badge>
  );
}
