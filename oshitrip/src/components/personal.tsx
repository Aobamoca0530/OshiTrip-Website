"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { z } from "zod";
import { tripSchema, type Trip } from "@/lib/schema";
const key = "oshitrip.personal.v1";
const emptyTrip: Trip = {
  start: "",
  end: "",
  stays: [],
  plans: [],
  venue_ids: [],
};
const personalSchema = z.object({
  version: z.literal(1),
  ips: z.array(z.string()),
  favorites: z.array(z.string()),
  trip: tripSchema,
});
type Personal = z.infer<typeof personalSchema>;
const empty: Personal = { version: 1, ips: [], favorites: [], trip: emptyTrip };
const initial = JSON.stringify(empty);
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("oshitrip-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("oshitrip-change", callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(key) || initial;
  } catch {
    return initial;
  }
}
type Context = {
  data: Personal;
  save: (next: Personal) => void;
  message: string;
  now: Date;
  toggleIP: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleVenue: (id: string) => void;
};
const PersonalContext = createContext<Context | null>(null);
export function PersonalProvider({
  children,
  initialNow,
}: {
  children: ReactNode;
  initialNow: string;
}) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => initial);
  const parsed = useMemo(() => {
    try {
      return personalSchema.safeParse(JSON.parse(raw));
    } catch {
      return null;
    }
  }, [raw]);
  const data = parsed?.success ? parsed.data : empty;
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const save = (next: Personal) => {
    const valid = personalSchema.safeParse(next);
    if (!valid.success) {
      setMessage(valid.error.issues[0].message);
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(valid.data));
      window.dispatchEvent(new Event("oshitrip-change"));
      setMessage("已保存在此浏览器");
    } catch {
      setMessage("保存失败：浏览器存储不可用或空间不足，请检查隐私设置。");
    }
  };
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
  return (
    <PersonalContext.Provider
      value={{
        data,
        save,
        message,
        now,
        toggleIP: (id) => save({ ...data, ips: toggle(data.ips, id) }),
        toggleFavorite: (id) =>
          save({ ...data, favorites: toggle(data.favorites, id) }),
        toggleVenue: (id) =>
          save({
            ...data,
            trip: { ...data.trip, venue_ids: toggle(data.trip.venue_ids, id) },
          }),
      }}
    >
      {(!parsed || !parsed.success) && (
        <div className="notice error">
          浏览器中保存的数据格式损坏，暂时显示空白偏好。重新保存会替换旧数据。
        </div>
      )}
      {children}
      <div className="save-toast" role="status" key={message + raw.length}>
        {message}
      </div>
    </PersonalContext.Provider>
  );
}
export function usePersonal() {
  const value = useContext(PersonalContext);
  if (!value) throw new Error("PersonalProvider missing");
  return value;
}
