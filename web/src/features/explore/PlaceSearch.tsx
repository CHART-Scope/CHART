"use client";

import { useId, useMemo, useRef, useState } from "react";

import {
  children,
  placeContext,
  searchPlaces,
  type ExplorePlace,
  type PlaceMatch,
} from "./exploreData";
import styles from "./explore.module.css";

/**
 * A searchable place picker. Typing autocompletes any district, division,
 * county, constituency or state in either country; an empty box lists the
 * areas of the place being viewed. Arrow keys move, Enter picks, Escape
 * closes.
 */
export function PlaceSearch({
  places,
  frameId,
  onPick,
}: {
  places: ExplorePlace[];
  frameId: string;
  onPick: (place: ExplorePlace) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const byId = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places],
  );
  const options: PlaceMatch[] = useMemo(() => {
    if (text.trim()) return searchPlaces(places, text);
    return children(places, frameId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((place) => ({ place, context: placeContext(byId, place) }));
  }, [places, text, frameId, byId]);
  const frameName = byId.get(frameId)?.name;
  const expanded = open && options.length > 0;

  const pick = (match: PlaceMatch) => {
    onPick(match.place);
    setText("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className={styles.search}>
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label="Search places"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        placeholder="Search a state, district, county or constituency"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(options.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && expanded && options[active]) {
            event.preventDefault();
            pick(options[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <ul id={`${id}-list`} className={styles.searchResults} role="listbox">
          {!text.trim() && frameName && (
            <li className={styles.searchHeading} role="presentation">
              Areas in {frameName}
            </li>
          )}
          {options.map((match, index) => (
            <li
              key={match.place.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              // Pick on mousedown, before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(match);
              }}
              // Follow the pointer only when it moves: a list opening under a
              // resting pointer must not change what Enter picks.
              onMouseMove={() => index !== active && setActive(index)}
            >
              <span>{highlight(match.place.name, text)}</span>
              <small>{match.context}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function highlight(name: string, text: string) {
  const needle = text.trim();
  const at = needle ? name.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <mark>{name.slice(at, at + needle.length)}</mark>
      {name.slice(at + needle.length)}
    </>
  );
}
