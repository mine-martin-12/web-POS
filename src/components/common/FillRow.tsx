import React from "react";
import { cn } from "@/lib/utils";

/** Item widths per layout: one per row on phones, two from `sm`, then `columns` per row. */
const ITEM_CLASSES = {
  "xl-4": "basis-full sm:basis-[calc(50%-0.5rem)] xl:basis-[calc(25%-0.75rem)]",
  "lg-4": "basis-full sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(25%-0.75rem)]",
  "xl-5": "basis-full sm:basis-[calc(50%-0.5rem)] xl:basis-[calc(20%-0.8rem)]",
} as const;

interface FillRowProps {
  /** How many items share a row on wide screens, and from which breakpoint. */
  layout: keyof typeof ITEM_CLASSES;
  /** Rendered element; `ul` wraps each item in an `li`. */
  as?: "div" | "section" | "ul";
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}

/**
 * Cards in rows that always reach the right edge: items grow, so a last row with fewer
 * items (7 cards in rows of 4, 3 months in rows of 4) stretches across the full width
 * instead of leaving an empty slot on the right.
 */
export function FillRow({ layout, as: Tag = "div", className, children, ...rest }: FillRowProps) {
  const Item = Tag === "ul" ? "li" : "div";
  return (
    <Tag className={cn("flex flex-wrap gap-4", className)} {...rest}>
      {flatten(children).map((child, i) => (
          <Item key={React.isValidElement(child) && child.key != null ? child.key : i} className={cn("flex min-w-0 grow [&>*]:w-full", ITEM_CLASSES[layout])}>
            {child}
          </Item>
      ))}
    </Tag>
  );
}

/** Children as a flat list: fragments (e.g. a group of admin-only cards) count as their items. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment
      ? flatten(child.props.children)
      : [child],
  );
}
