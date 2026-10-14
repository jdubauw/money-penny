import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared";

export function CategoryInput({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const options = categories.filter((category) =>
    category.toLowerCase().includes(search.toLowerCase()),
  );
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`category-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function choose(category: string) {
    onChange(category);
    setOpen(false);
    setSearch("");
    setActive(-1);
    input.current?.focus();
  }
  return (
    <Field id="edit-category" label="Category">
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
            setActive(-1);
          }
        }}
      >
        <Input
          ref={input}
          id="edit-category"
          role="combobox"
          aria-expanded={open}
          aria-controls="category-options"
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 ? `category-option-${active}` : undefined
          }
          value={value}
          required
          maxLength={100}
          className="pr-12"
          placeholder="Select or type a category"
          onChange={(event) => {
            onChange(event.target.value);
            setSearch(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                setActive(-1);
              }
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) setSearch("");
              setOpen(true);
              const count = open ? options.length : categories.length;
              setActive((previous) =>
                count
                  ? previous < 0
                    ? event.key === "ArrowDown"
                      ? 0
                      : count - 1
                    : (previous +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        count) %
                      count
                  : -1,
              );
            } else if (
              event.key === "Enter" &&
              open &&
              active >= 0 &&
              options[active]
            ) {
              event.preventDefault();
              choose(options[active]);
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          className="absolute right-0 top-0 size-11 p-0"
          aria-label="Show existing categories"
          aria-expanded={open}
          onClick={() => {
            setSearch("");
            setActive(-1);
            setOpen(!open);
            input.current?.focus();
          }}
        >
          <ChevronDown />
        </Button>
        {open && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
            id="category-options"
            role="listbox"
            aria-label="Existing categories"
          >
            {options.map((category, index) => (
              <button
                key={category}
                id={`category-option-${index}`}
                type="button"
                role="option"
                aria-selected={category === value}
                tabIndex={-1}
                title={category}
                className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-3 text-left text-sm ${active === index ? "bg-accent text-accent-foreground" : "hover:bg-accent"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(category)}
              >
                <span className="truncate">{category}</span>
                {category === value && (
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            ))}
            {!options.length && (
              <div className="p-3 text-sm text-muted-foreground">
                No matching categories. Save to use your new category.
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Choose an existing category or type your own.
      </p>
    </Field>
  );
}
