import { de } from "@/lib/translations/de";

interface SignatureProgressProps {
  current: number;
  required: number;
  label?: string;
  color?: "green" | "blue" | "purple";
}

export function SignatureProgress({
  current,
  required,
  label,
  color = "green"
}: SignatureProgressProps) {
  const percentage = Math.min((current / required) * 100, 100);

  const colorClasses = {
    green: "bg-green-600",
    blue: "bg-blue-600",
    purple: "bg-purple-600",
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label || de.verification.signatures}</span>
        <span className="font-medium">
          {current} von {required}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {current >= required && (
        <div className="text-xs text-green-600 font-medium">
          ✓ Unterschriften-Schwelle erreicht
        </div>
      )}
    </div>
  );
}
