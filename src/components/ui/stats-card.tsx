import React from "react";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  icon,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {title}
            </p>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-50">
              {value}
            </p>
            {trend && (
              <p
                className={cn(
                  "mt-2 text-sm font-medium",
                  trend.direction === "up"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {trend.direction === "up" ? "↑" : "↓"} {Math.abs(trend.value)}%
              </p>
            )}
          </div>
          {icon && (
            <div className="flex-shrink-0 ml-4 p-3 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-200">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
