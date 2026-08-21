import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

interface EventSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
}

export function EventSelector({ value, onValueChange }: EventSelectorProps) {
  const { data: events } = useAuthQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("*")
        .order("event_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const selectedEvent = events?.find((e) => e.id === value);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        <span className="text-sm font-medium">Current Event:</span>
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-[300px]">
          <SelectValue placeholder="Select an event" />
        </SelectTrigger>
        <SelectContent>
          {events?.map((event) => (
            <SelectItem key={event.id} value={event.id}>
              <div className="flex items-center gap-2">
                <span>{event.title}</span>
                <Badge
                  variant={
                    event.status === "published"
                      ? "default"
                      : event.status === "draft"
                      ? "secondary"
                      : "outline"
                  }
                  className="text-xs"
                >
                  {event.status}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedEvent && (
        <Badge
          variant={
            selectedEvent.status === "published"
              ? "default"
              : selectedEvent.status === "draft"
              ? "secondary"
              : "outline"
          }
        >
          {selectedEvent.status}
        </Badge>
      )}
    </div>
  );
}