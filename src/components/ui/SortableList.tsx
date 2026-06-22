"use client";

import React, { useEffect, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * Generic vertical sortable list. Replaces the fake "drag handle" pattern
 * (GripVertical icon next to arrow buttons) that the audit flagged as an
 * affordance mismatch.
 *
 * Usage:
 *   <SortableList
 *     items={waypoints}
 *     getId={(w, i) => `wp-${i}`}
 *     onReorder={(next) => writeList(next)}
 *     renderItem={(w, i, handleProps) => <Row ... handleProps={handleProps} />}
 *   />
 *
 * `handleProps` is destructured into the drag handle element — pass them
 * onto the GripVertical button so only THAT element initiates the drag.
 * Arrow buttons elsewhere on the row continue to work via your own onMove.
 */
export type HandleProps = {
  ref: (n: HTMLElement | null) => void;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
};

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
}: {
  items: T[];
  getId: (item: T, index: number) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number, handleProps: HandleProps) => React.ReactNode;
}) {
  // ── SSR-safe mount ────────────────────────────────────────────────────
  // @dnd-kit's DndContext auto-generates incremental IDs (DndDescribedBy-N)
  // for screen-reader text. Those counters differ between server and client
  // → React hydration mismatch. Defer DndContext mount until after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map((it, i) => getId(it, i));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  // Pre-hydration fallback: render the same rows WITHOUT drag, using a
  // no-op handle. Identical DOM tree to the DndContext output (sans
  // dnd-kit-injected aria attrs that change between SSR and client), so
  // hydration completes cleanly. After mount, swap in the real DndContext.
  if (!mounted) {
    const noopHandle: HandleProps = {
      ref: () => {},
      attributes: {},
      listeners: undefined,
    };
    return (
      <>
        {items.map((item, i) => (
          <div key={ids[i]}>{renderItem(item, i, noopHandle)}</div>
        ))}
      </>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableItem key={ids[i]} id={ids[i]}>
            {(handle) => renderItem(item, i, handle)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

const SortableItem: React.FC<{
  id: string;
  children: (handle: HandleProps) => React.ReactNode;
}> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({
        ref: setNodeRef,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown> | undefined,
      })}
    </div>
  );
};

/** Drop-in drag handle for sortable rows. Pass it the `handleProps` from `renderItem`. */
export const DragHandle: React.FC<{ handle: HandleProps; size?: number }> = ({
  handle,
  size = 12,
}) => (
  <button
    {...handle.attributes}
    {...(handle.listeners ?? {})}
    className="cursor-grab active:cursor-grabbing text-white/30 hover:text-amber"
    title="Drag to reorder"
    type="button"
  >
    <GripVertical size={size} />
  </button>
);
