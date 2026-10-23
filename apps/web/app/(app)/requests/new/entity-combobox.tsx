"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export interface EntityOption {
  id: string;
  name: string;
  slug: string;
}

// The shadcn Combobox pattern (Popover + Command), searchable by name.
export function EntityCombobox({
  id,
  entities,
  value,
  onChange,
  onClose,
  invalid,
  describedBy,
}: {
  id: string;
  entities: EntityOption[];
  value: string | null;
  onChange: (id: string) => void;
  onClose: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = entities.find((e) => e.id === value);

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) onClose();
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {selected ? selected.name : "Choose an entity"}
          </span>
          <ChevronsUpDown
            data-icon="inline-end"
            className="text-neutral-400"
            aria-hidden
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder="Search by name" />
          <CommandList>
            <CommandEmpty>No entity found.</CommandEmpty>
            <CommandGroup>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  // cmdk filters on the value: the name only.
                  value={entity.name}
                  data-checked={entity.id === value}
                  onSelect={() => {
                    onChange(entity.id);
                    openChange(false);
                  }}
                >
                  {entity.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
