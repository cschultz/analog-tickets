import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface GuestOfComboboxProps {
  value: string;
  onChange: (value: string) => void;
  existingValues: string[];
  placeholder?: string;
}

export function GuestOfCombobox({
  value,
  onChange,
  existingValues,
  placeholder = "Select or type a name...",
}: GuestOfComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Sort existing values alphabetically and filter duplicates
  const sortedOptions = useMemo(() => {
    const unique = [...new Set(existingValues.filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [existingValues]);

  // Filter options based on input
  const filteredOptions = useMemo(() => {
    if (!inputValue) return sortedOptions;
    return sortedOptions.filter((option) =>
      option.toLowerCase().includes(inputValue.toLowerCase())
    );
  }, [sortedOptions, inputValue]);

  // Check if input is a new value not in the list
  const isNewValue =
    inputValue.trim() !== "" &&
    !sortedOptions.some(
      (option) => option.toLowerCase() === inputValue.toLowerCase()
    );

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setOpen(false);
    setInputValue("");
  };

  const handleAddNew = () => {
    onChange(inputValue.trim());
    setOpen(false);
    setInputValue("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AdminButton
          variant="adminOutline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10"
        >
          {value || <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </AdminButton>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or add new..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            {filteredOptions.length === 0 && !isNewValue && (
              <CommandEmpty>No matches found. Type to add new.</CommandEmpty>
            )}
            {isNewValue && (
              <CommandGroup heading="Add new">
                <CommandItem
                  value={inputValue}
                  onSelect={handleAddNew}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add "{inputValue.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
            {filteredOptions.length > 0 && (
              <CommandGroup heading="Previously used">
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => handleSelect(option)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
