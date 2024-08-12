/* @ds-bundle: {"format":3,"namespace":"CadenceDesignSystem_9c64df","components":[{"name":"List","sourcePath":"components/data/List.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Checklist","sourcePath":"components/day/Checklist.jsx"},{"name":"DayChart","sourcePath":"components/day/DayChart.jsx"},{"name":"EmptyState","sourcePath":"components/day/EmptyState.jsx"},{"name":"ProgressBar","sourcePath":"components/day/ProgressBar.jsx"},{"name":"ProgressRing","sourcePath":"components/day/ProgressRing.jsx"},{"name":"Timer","sourcePath":"components/day/Timer.jsx"},{"name":"Avatar","sourcePath":"components/display/Avatar.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Chip","sourcePath":"components/display/Chip.jsx"},{"name":"Tag","sourcePath":"components/display/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Popover","sourcePath":"components/feedback/Popover.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Slider","sourcePath":"components/forms/Slider.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Breadcrumbs","sourcePath":"components/navigation/Breadcrumbs.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/data/List.jsx":"7026ce9487ac","components/data/Table.jsx":"d1010d5d791c","components/day/Checklist.jsx":"6006037d7b45","components/day/DayChart.jsx":"cf2db8e5cde2","components/day/EmptyState.jsx":"75e36db3a76f","components/day/ProgressBar.jsx":"3d4ef84b4902","components/day/ProgressRing.jsx":"947937eaa028","components/day/Timer.jsx":"caaeabc86ad6","components/display/Avatar.jsx":"8f86816cc562","components/display/Badge.jsx":"16f3121c57e5","components/display/Card.jsx":"c6f78db1bc39","components/display/Chip.jsx":"8a7176e1511a","components/display/Tag.jsx":"ccde67386541","components/feedback/Dialog.jsx":"06e88fc48329","components/feedback/Popover.jsx":"41d1665a2ae8","components/feedback/Toast.jsx":"6ee1e91bd942","components/feedback/Tooltip.jsx":"c63328e57e4a","components/forms/Button.jsx":"b91b96c24093","components/forms/Checkbox.jsx":"4583a7d5c865","components/forms/IconButton.jsx":"43e6c5b4c9dc","components/forms/Input.jsx":"3ce8fb7d61e6","components/forms/Radio.jsx":"62ebc6eaf661","components/forms/Select.jsx":"b56fd998a233","components/forms/Slider.jsx":"dd28dfa4aab7","components/forms/Switch.jsx":"a81c0ec95377","components/forms/Textarea.jsx":"1e44f1140a83","components/navigation/Breadcrumbs.jsx":"ef466e8def4c","components/navigation/Sidebar.jsx":"4359aaf5c3f2","components/navigation/Tabs.jsx":"6612ef2d7565","ui_kits/dashboard/AppShell.jsx":"4ee802ed7f96","ui_kits/dashboard/FocusScreen.jsx":"d2c0e68bf766","ui_kits/dashboard/Icon.jsx":"1a9304ebd802","ui_kits/dashboard/ProgressScreen.jsx":"6a3c862a24ee","ui_kits/dashboard/RoutinesScreen.jsx":"f6c2cf33d890","ui_kits/dashboard/TodayScreen.jsx":"6e71cdc38034"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CadenceDesignSystem_9c64df = window.CadenceDesignSystem_9c64df || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/List.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Vertical list container. Use with List.Item. */
function List({
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["cds-list", className].filter(Boolean).join(" ")
  }, rest), children);
}
List.Item = function ListItem({
  leading,
  title,
  meta,
  trailing,
  interactive = false,
  className = "",
  ...rest
}) {
  const cls = ["cds-list-item", interactive ? "cds-list-item--interactive" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), leading, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-list-item__title"
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    className: "cds-list-item__meta"
  }, meta)), trailing);
};
Object.assign(__ds_scope, { List });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/List.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
/**
 * Simple data table. `columns: [{key,header,align?,render?}]`, `rows: object[]`.
 * Cosmetic only — sorting/paging are the consumer's job.
 */
function Table({
  columns = [],
  rows = [],
  rowKey = "id",
  className = ""
}) {
  return /*#__PURE__*/React.createElement("table", {
    className: ["cds-table", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: c.align || "left"
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r[rowKey] ?? i
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      textAlign: c.align || "left"
    }
  }, c.render ? c.render(r) : r[c.key]))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/day/Checklist.jsx
try { (() => {
const CheckIcon = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "3",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20 6 9 17l-5-5"
}));

/**
 * Day checklist. `items: [{id,label,done,time?}]`, `onToggle(id)`.
 * Whole row is a 44px tap target; completed rows soften, never vanish.
 */
function Checklist({
  items = [],
  onToggle,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ["cds-checklist", className].filter(Boolean).join(" ")
  }, items.map(it => /*#__PURE__*/React.createElement("label", {
    key: it.id,
    className: `cds-checkitem${it.done ? " cds-checkitem--done" : ""}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!it.done,
    onChange: () => onToggle && onToggle(it.id),
    style: {
      position: "absolute",
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "cds-choice__box",
    style: {
      background: it.done ? "var(--accent)" : "var(--surface-inset)",
      borderColor: it.done ? "var(--accent)" : "var(--border-strong)",
      color: it.done ? "var(--text-on-accent)" : "transparent",
      border: "1.5px solid"
    }
  }, /*#__PURE__*/React.createElement(CheckIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "cds-checkitem__label"
  }, it.label), it.time && /*#__PURE__*/React.createElement("span", {
    className: "cds-checkitem__time"
  }, it.time))));
}
Object.assign(__ds_scope, { Checklist });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/day/Checklist.jsx", error: String((e && e.message) || e) }); }

// components/day/DayChart.jsx
try { (() => {
/**
 * Calm day-progress chart — vertical bars per slot (e.g. hours/blocks).
 * `data: [{label, value, tone?}]`, `max` sets the scale.
 */
function DayChart({
  data = [],
  max,
  height = 140,
  className = ""
}) {
  const peak = max || Math.max(1, ...data.map(d => d.value));
  const toneColor = t => t === "success" ? "var(--success-solid)" : t === "muted" ? "var(--surface-3)" : "var(--accent)";
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: "var(--space-2)",
      height
    }
  }, data.map((d, i) => {
    const h = Math.max(4, d.value / peak * (height - 24));
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        height: "100%",
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement("div", {
      title: `${d.label}: ${d.value}`,
      style: {
        width: "100%",
        maxWidth: "32px",
        height: h,
        background: toneColor(d.tone),
        borderRadius: "var(--radius-sm)",
        transition: "height var(--duration-slow) var(--ease-out)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--font-caption)",
        color: "var(--text-subtle)"
      }
    }, d.label));
  }));
}
Object.assign(__ds_scope, { DayChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/day/DayChart.jsx", error: String((e && e.message) || e) }); }

// components/day/EmptyState.jsx
try { (() => {
/** Friendly empty state. `icon`, `title`, `desc`, optional `action`. */
function EmptyState({
  icon,
  title,
  desc,
  action,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ["cds-empty", className].filter(Boolean).join(" ")
  }, icon && /*#__PURE__*/React.createElement("div", {
    className: "cds-empty__icon"
  }, icon), title && /*#__PURE__*/React.createElement("div", {
    className: "cds-empty__title"
  }, title), desc && /*#__PURE__*/React.createElement("div", {
    className: "cds-empty__desc"
  }, desc), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-2)"
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/day/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/day/ProgressBar.jsx
try { (() => {
/** Linear progress. `value`/`max`, optional label + count. */
function ProgressBar({
  value = 0,
  max = 100,
  label,
  showCount = false,
  tone = "accent",
  className = ""
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", {
    className: ["cds-progress", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-progress__track",
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max
  }, /*#__PURE__*/React.createElement("div", {
    className: `cds-progress__fill${tone === "success" ? " cds-progress__fill--success" : ""}`,
    style: {
      width: `${pct}%`
    }
  })), (label || showCount) && /*#__PURE__*/React.createElement("div", {
    className: "cds-progress__meta"
  }, /*#__PURE__*/React.createElement("span", null, label), showCount && /*#__PURE__*/React.createElement("span", null, value, " / ", max)));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/day/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/day/ProgressRing.jsx
try { (() => {
/**
 * Circular progress ring — good for "how much of the day / task is done".
 * `value`/`max`, `size`, `thickness`. Center renders `children` or the %.
 */
function ProgressRing({
  value = 0,
  max = 100,
  size = 96,
  thickness = 8,
  tone = "accent",
  showLabel = true,
  children,
  className = ""
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === "success" ? "var(--success-solid)" : tone === "warning" ? "var(--warning-solid)" : "var(--accent)";
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      position: "relative",
      width: size,
      height: size,
      display: "inline-grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    style: {
      transform: "rotate(-90deg)"
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--surface-3)",
    strokeWidth: thickness
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: color,
    strokeWidth: thickness,
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: c * (1 - pct),
    style: {
      transition: "stroke-dashoffset var(--duration-slow) var(--ease-out)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center",
      textAlign: "center"
    }
  }, children != null ? children : showLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--weight-semibold) var(--text-xl)/1 var(--font-mono)",
      color: "var(--text-strong)",
      fontVariantNumeric: "tabular-nums"
    }
  }, Math.round(pct * 100), "%")));
}
Object.assign(__ds_scope, { ProgressRing });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/day/ProgressRing.jsx", error: String((e && e.message) || e) }); }

// components/day/Timer.jsx
try { (() => {
const {
  useState,
  useEffect,
  useRef
} = React;
const fmt = s => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const Ctrl = ({
  label,
  onClick,
  children
}) => /*#__PURE__*/React.createElement("button", {
  className: "cds-iconbtn",
  onClick: onClick,
  "aria-label": label
}, children);

/**
 * Countdown timer with a progress ring — built for time-blindness support.
 * Self-driving: pass `durationSec`; controls start / pause / reset.
 */
function Timer({
  durationSec = 1500,
  autoStart = false,
  onComplete,
  label = "Focus",
  className = ""
}) {
  const [remaining, setRemaining] = useState(durationSec);
  const [running, setRunning] = useState(autoStart);
  const ref = useRef(null);
  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(ref.current);
          setRunning(false);
          onComplete && onComplete();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, [running, onComplete]);
  const reset = () => {
    setRunning(false);
    setRemaining(durationSec);
  };
  const done = remaining === 0;
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.ProgressRing, {
    value: durationSec - remaining,
    max: durationSec,
    size: 156,
    thickness: 12,
    tone: done ? "success" : "accent"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--weight-medium) var(--text-3xl)/1 var(--font-mono)",
      color: "var(--text-strong)",
      fontVariantNumeric: "tabular-nums"
    }
  }, fmt(remaining)), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--font-caption)",
      color: "var(--text-subtle)",
      marginTop: "4px"
    }
  }, done ? "done" : `${label} · left`))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Ctrl, {
    label: "Reset",
    onClick: reset
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 3v5h5"
  }))), /*#__PURE__*/React.createElement(Ctrl, {
    label: running ? "Pause" : "Start",
    onClick: () => !done && setRunning(v => !v)
  }, running ? /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "5",
    width: "4",
    height: "14",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "5",
    width: "4",
    height: "14",
    rx: "1"
  })) : /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 6 4.5z"
  })))));
}
Object.assign(__ds_scope, { Timer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/day/Timer.jsx", error: String((e && e.message) || e) }); }

// components/display/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const statusColor = {
  online: "var(--success-solid)",
  busy: "var(--warning-solid)",
  away: "var(--text-subtle)"
};

/** Avatar with image or initials, optional status dot. */
function Avatar({
  src,
  name = "",
  size = "md",
  status,
  className = "",
  ...rest
}) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ["cds-avatar", `cds-avatar--${size}`, className].filter(Boolean).join(" "),
    style: {
      position: status ? "relative" : undefined
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initials, status && /*#__PURE__*/React.createElement("span", {
    className: "cds-avatar__status",
    style: {
      background: statusColor[status]
    }
  }));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Small status label. Use a dot for live statuses. */
function Badge({
  tone = "neutral",
  dot = false,
  icon = null,
  className = "",
  children,
  ...rest
}) {
  const cls = ["cds-badge", `cds-badge--${tone}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "cds-badge__dot"
  }), icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Surface container with soft elevation. Compose with the Card.* slots. */
function Card({
  interactive = false,
  flat = false,
  className = "",
  children,
  ...rest
}) {
  const cls = ["cds-card", interactive ? "cds-card--interactive" : "", flat ? "cds-card--flat" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), children);
}
Card.Header = function CardHeader({
  title,
  desc,
  action,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "cds-card__header",
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("div", {
    className: "cds-card__title"
  }, title), desc && /*#__PURE__*/React.createElement("div", {
    className: "cds-card__desc"
  }, desc), children), action);
};
Card.Body = function CardBody({
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "cds-card__body"
  }, rest), children);
};
Card.Footer = function CardFooter({
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "cds-card__footer"
  }, rest), children);
};
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Selectable pill — filters, quick toggles. Controlled via `selected`. */
function Chip({
  selected = false,
  icon = null,
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ["cds-chip", className].filter(Boolean).join(" "),
    "aria-pressed": selected
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Chip.jsx", error: String((e && e.message) || e) }); }

// components/display/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const XIcon = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M18 6 6 18M6 6l12 12"
}));

/** Removable label for applied filters / selections. */
function Tag({
  onRemove,
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ["cds-tag", className].filter(Boolean).join(" ")
  }, rest), children, onRemove && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "cds-tag__remove",
    onClick: onRemove,
    "aria-label": "Remove"
  }, /*#__PURE__*/React.createElement(XIcon, null)));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
const {
  useEffect
} = React;
const XIcon = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M18 6 6 18M6 6l12 12"
}));

/** Modal dialog. Controlled via `open` / `onClose`. Closes on Esc + scrim click. */
function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === "Escape" && onClose && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "cds-scrim",
    onClick: e => e.target === e.currentTarget && onClose && onClose()
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-dialog",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === "string" ? title : undefined,
    style: {
      maxWidth: width
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-dialog__header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-dialog__title"
  }, title), /*#__PURE__*/React.createElement("button", {
    className: "cds-iconbtn cds-iconbtn--sm",
    onClick: onClose,
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(XIcon, null))), /*#__PURE__*/React.createElement("div", {
    className: "cds-dialog__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "cds-dialog__footer"
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Popover.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState,
  useRef,
  useEffect
} = React;
/** Click-triggered floating panel. Pass the trigger as `trigger`, content as children. */
function Popover({
  trigger,
  children,
  align = "start"
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = e => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      position: "relative",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => setOpen(v => !v)
  }, trigger), open && /*#__PURE__*/React.createElement("div", {
    className: "cds-popover",
    style: {
      position: "absolute",
      top: "calc(100% + 8px)",
      [align === "end" ? "right" : "left"]: 0,
      zIndex: 50
    },
    onClick: () => setOpen(false)
  }, children));
}
Popover.Item = function PopoverItem({
  icon,
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["cds-popover__item", className].filter(Boolean).join(" ")
  }, rest), icon, children);
};
Object.assign(__ds_scope, { Popover });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Popover.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const icons = {
  success: /*#__PURE__*/React.createElement("path", {
    d: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3"
  }),
  warning: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4M12 17h.01"
  })),
  error: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15 9-6 6M9 9l6 6"
  })),
  info: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4M12 8h.01"
  }))
};
const XIcon = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M18 6 6 18M6 6l12 12"
}));

/** A single calm notification. Compose your own stack/queue around it. */
function Toast({
  tone = "info",
  title,
  children,
  onDismiss,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ["cds-toast", `cds-toast--${tone}`, className].filter(Boolean).join(" "),
    role: "status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cds-toast__icon"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, icons[tone])), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "cds-toast__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "cds-toast__msg"
  }, children)), onDismiss && /*#__PURE__*/React.createElement("button", {
    className: "cds-iconbtn cds-iconbtn--sm",
    onClick: onDismiss,
    "aria-label": "Dismiss"
  }, /*#__PURE__*/React.createElement(XIcon, null)));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
const {
  useState
} = React;
/** Hover/focus tooltip. Wraps a single child; `label` is the tip text. */
function Tooltip({
  label,
  side = "top",
  children
}) {
  const [show, setShow] = useState(false);
  const pos = {
    top: {
      bottom: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    bottom: {
      top: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    right: {
      left: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    },
    left: {
      right: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    }
  }[side];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-flex"
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false),
    onFocus: () => setShow(true),
    onBlur: () => setShow(false)
  }, children, show && /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    className: "cds-tooltip",
    style: {
      position: "absolute",
      whiteSpace: "nowrap",
      zIndex: 60,
      ...pos
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Cadence Button — the primary action control.
 * One "primary" per screen; everything else is secondary / ghost.
 */
function Button({
  variant = "secondary",
  size = "md",
  icon = null,
  iconRight = null,
  fullWidth = false,
  disabled = false,
  as = "button",
  className = "",
  children,
  style,
  ...rest
}) {
  const Tag = as;
  const cls = ["cds-btn", `cds-btn--${variant}`, `cds-btn--${size}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    disabled: Tag === "button" ? disabled : undefined,
    "aria-disabled": disabled || undefined,
    style: {
      width: fullWidth ? "100%" : undefined,
      ...style
    }
  }, rest), icon, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CheckIcon = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "3",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20 6 9 17l-5-5"
}));

/** Checkbox with a generous label hit area. */
function Checkbox({
  label,
  checked,
  defaultChecked,
  disabled,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ["cds-choice", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked,
    defaultChecked: defaultChecked,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cds-choice__box"
  }, /*#__PURE__*/React.createElement(CheckIcon, null)), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Icon-only button. Always pass aria-label for accessibility. */
function IconButton({
  icon,
  size = "md",
  className = "",
  "aria-label": ariaLabel,
  ...rest
}) {
  const cls = ["cds-iconbtn", size === "sm" ? "cds-iconbtn--sm" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    "aria-label": ariaLabel
  }, rest), icon);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useId
} = React;
/** Text input with optional label, hint, error and leading icon. */
function Input({
  label,
  hint,
  error,
  optional = false,
  icon = null,
  id,
  className = "",
  ...rest
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const inputCls = ["cds-input", error ? "cds-input--invalid" : "", className].filter(Boolean).join(" ");
  const input = /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    className: inputCls,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": hint || error ? `${fieldId}-hint` : undefined
  }, rest));
  return /*#__PURE__*/React.createElement("div", {
    className: "cds-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "cds-label",
    htmlFor: fieldId
  }, label, optional && /*#__PURE__*/React.createElement("span", {
    className: "cds-optional"
  }, " \xB7 optional")), icon ? /*#__PURE__*/React.createElement("div", {
    className: "cds-input-group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cds-input-group__icon"
  }, icon), input) : input, (error || hint) && /*#__PURE__*/React.createElement("span", {
    id: `${fieldId}-hint`,
    className: `cds-hint${error ? " cds-hint--error" : ""}`
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Radio button. Group several with the same `name`. */
function Radio({
  label,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ["cds-choice", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cds-choice__box cds-choice__box--radio"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cds-choice__dot"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useId
} = React;
/** Native select, styled. Pass options as [{value,label}] or use children. */
function Select({
  label,
  hint,
  optional = false,
  options,
  id,
  className = "",
  children,
  ...rest
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  return /*#__PURE__*/React.createElement("div", {
    className: "cds-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "cds-label",
    htmlFor: fieldId
  }, label, optional && /*#__PURE__*/React.createElement("span", {
    className: "cds-optional"
  }, " \xB7 optional")), /*#__PURE__*/React.createElement("select", _extends({
    id: fieldId,
    className: ["cds-select", className].filter(Boolean).join(" ")
  }, rest), options ? options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)) : children), hint && /*#__PURE__*/React.createElement("span", {
    className: "cds-hint"
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Slider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Range slider with an accent-filled track. */
function Slider({
  value,
  min = 0,
  max = 100,
  className = "",
  style,
  ...rest
}) {
  const pct = (Number(value ?? min) - min) / (max - min) * 100;
  return /*#__PURE__*/React.createElement("input", _extends({
    type: "range",
    className: ["cds-slider", className].filter(Boolean).join(" "),
    value: value,
    min: min,
    max: max,
    style: {
      background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--surface-3) ${pct}%, var(--surface-3) 100%)`,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Slider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Slider.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** On/off toggle for immediate settings (e.g. reminders, reduced motion). */
function Switch({
  label,
  checked,
  defaultChecked,
  disabled,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ["cds-switch", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    checked: checked,
    defaultChecked: defaultChecked,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cds-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cds-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", {
    className: "cds-switch__label"
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useId
} = React;
/** Multi-line text field with the same label / hint / error contract as Input. */
function Textarea({
  label,
  hint,
  error,
  optional = false,
  id,
  className = "",
  ...rest
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const cls = ["cds-textarea", error ? "cds-textarea--invalid" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: "cds-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "cds-label",
    htmlFor: fieldId
  }, label, optional && /*#__PURE__*/React.createElement("span", {
    className: "cds-optional"
  }, " \xB7 optional")), /*#__PURE__*/React.createElement("textarea", _extends({
    id: fieldId,
    className: cls,
    "aria-invalid": error ? true : undefined
  }, rest)), (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: `cds-hint${error ? " cds-hint--error" : ""}`
  }, error || hint));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumbs.jsx
try { (() => {
const Chevron = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "m9 18 6-6-6-6"
}));

/** Breadcrumb trail. `items: [{label, href?}]`; last item is current. */
function Breadcrumbs({
  items = [],
  className = ""
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: ["cds-crumbs", className].filter(Boolean).join(" "),
    "aria-label": "Breadcrumb"
  }, items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, last ? /*#__PURE__*/React.createElement("span", {
      className: "cds-crumbs__current",
      "aria-current": "page"
    }, it.label) : /*#__PURE__*/React.createElement("a", {
      href: it.href || "#"
    }, it.label), !last && /*#__PURE__*/React.createElement("span", {
      className: "cds-crumbs__sep"
    }, /*#__PURE__*/React.createElement(Chevron, null)));
  }));
}
Object.assign(__ds_scope, { Breadcrumbs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumbs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** App sidebar shell. Use with Sidebar.Item and Sidebar.Section. */
function Sidebar({
  className = "",
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: ["cds-sidebar", className].filter(Boolean).join(" "),
    style: {
      width: "var(--sidebar-w)",
      background: "var(--bg-subtle)",
      borderRight: "1px solid var(--border-subtle)",
      padding: "var(--space-4)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
      ...style
    }
  }, rest), children);
}
Sidebar.Item = function SidebarItem({
  icon,
  active = false,
  badge,
  as = "button",
  className = "",
  children,
  ...rest
}) {
  const Tag = as;
  const cls = ["cds-navitem", active ? "cds-navitem--active" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    "aria-current": active ? "page" : undefined
  }, rest), icon, /*#__PURE__*/React.createElement("span", null, children), badge != null && /*#__PURE__*/React.createElement("span", {
    className: "cds-navitem__badge"
  }, badge));
};
Sidebar.Section = function SidebarSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
      marginTop: "var(--space-4)"
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--font-caption)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--text-subtle)",
      padding: "0 var(--space-3)",
      marginBottom: "var(--space-1)"
    }
  }, label), children);
};
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/** Tab bar. `items: [{id,label,icon?}]`, controlled via `value`/`onChange`. */
function Tabs({
  items = [],
  value,
  onChange,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ["cds-tabs", className].filter(Boolean).join(" "),
    role: "tablist"
  }, items.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    role: "tab",
    className: "cds-tab",
    "aria-selected": value === t.id,
    onClick: () => onChange && onChange(t.id)
  }, t.icon, t.label)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/AppShell.jsx
try { (() => {
(function () {
  const {
    Sidebar,
    IconButton,
    Avatar,
    Badge
  } = window.CadenceDesignSystem_9c64df;
  const Icon = window.Icon;
  const NAV = [{
    id: "today",
    label: "Today",
    icon: "layout-dashboard"
  }, {
    id: "routines",
    label: "Routines",
    icon: "repeat",
    badge: "3"
  }, {
    id: "focus",
    label: "Focus",
    icon: "timer"
  }, {
    id: "progress",
    label: "Progress",
    icon: "chart-column"
  }];
  function Brand() {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 10px 16px"
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: window.__resources && window.__resources.logoMark || "../../assets/logo-mark.svg",
      width: "30",
      height: "30",
      alt: ""
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--weight-semibold) 19px/1 var(--font-sans)",
        color: "var(--text-strong)",
        letterSpacing: "-0.4px"
      }
    }, "Cadence"));
  }
  function AppShell({
    route,
    setRoute,
    theme,
    setTheme,
    title,
    subtitle,
    children,
    actions
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-base)"
      }
    }, /*#__PURE__*/React.createElement(Sidebar, {
      style: {
        position: "sticky",
        top: 0,
        height: "100vh"
      }
    }, /*#__PURE__*/React.createElement(Brand, null), NAV.map(n => /*#__PURE__*/React.createElement(Sidebar.Item, {
      key: n.id,
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: n.icon
      }),
      badge: n.badge,
      active: route === n.id,
      onClick: () => setRoute(n.id)
    }, n.label)), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }
    }, /*#__PURE__*/React.createElement(Sidebar.Item, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "settings"
      })
    }, "Settings"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 8px",
        marginTop: "4px",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: "Mara Lee",
      size: "sm",
      status: "online"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-label)",
        color: "var(--text-strong)"
      }
    }, "Mara Lee"), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-caption)",
        color: "var(--text-subtle)"
      }
    }, "Free plan"))))), /*#__PURE__*/React.createElement("main", {
      style: {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("header", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 32px",
        borderBottom: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        background: "color-mix(in oklab, var(--bg-base) 88%, transparent)",
        backdropFilter: "blur(8px)",
        zIndex: 10
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
      style: {
        font: "var(--font-h2)",
        color: "var(--text-strong)",
        letterSpacing: "-0.01em"
      }
    }, title), subtitle && /*#__PURE__*/React.createElement("p", {
      style: {
        font: "var(--font-body-sm)",
        color: "var(--text-muted)",
        marginTop: "2px"
      }
    }, subtitle)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, actions, /*#__PURE__*/React.createElement(IconButton, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: theme === "dark" ? "sun" : "moon"
      }),
      "aria-label": "Toggle theme",
      onClick: () => setTheme(theme === "dark" ? "light" : "dark")
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "bell"
      }),
      "aria-label": "Notifications"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "28px 32px",
        maxWidth: "1080px",
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box"
      }
    }, children)));
  }
  window.AppShell = AppShell;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/FocusScreen.jsx
try { (() => {
(function () {
  const {
    Card,
    Timer,
    Checklist,
    Button,
    Badge
  } = window.CadenceDesignSystem_9c64df;
  function FocusScreen() {
    const Icon = window.Icon;
    const [steps, setSteps] = React.useState([{
      id: 1,
      label: "Open the project brief",
      done: true
    }, {
      id: 2,
      label: "Draft the outline",
      done: false
    }, {
      id: 3,
      label: "Write section one",
      done: false
    }]);
    const toggle = id => setSteps(steps.map(s => s.id === id ? {
      ...s,
      done: !s.done
    } : s));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px",
        alignItems: "start"
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
        padding: "32px"
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "accent",
      dot: true
    }, "In session \xB7 Deep work"), /*#__PURE__*/React.createElement(Timer, {
      durationSec: 1500,
      label: "Focus",
      autoStart: false
    }), /*#__PURE__*/React.createElement("p", {
      style: {
        font: "var(--font-body)",
        color: "var(--text-muted)",
        textAlign: "center",
        maxWidth: "22rem",
        lineHeight: "var(--leading-normal)"
      }
    }, "One block at a time. When the ring empties, you'll get a gentle nudge to take a break \u2014 no alarms."))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Header, {
      title: "This block",
      desc: "Three small steps"
    }), /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        paddingTop: 0
      }
    }, /*#__PURE__*/React.createElement(Checklist, {
      items: steps,
      onToggle: toggle
    }))), /*#__PURE__*/React.createElement(Card, {
      flat: true,
      style: {
        background: "var(--surface-2)"
      }
    }, /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-md)",
        background: "var(--info-bg)",
        color: "var(--info-text)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "coffee"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-label)",
        color: "var(--text-strong)"
      }
    }, "Break after this"), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-caption)",
        color: "var(--text-subtle)"
      }
    }, "5 minutes \xB7 stretch, water, breathe")), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "arrow-right"
      }),
      iconRight: null
    }, "Skip")))));
  }
  window.FocusScreen = FocusScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/FocusScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/Icon.jsx
try { (() => {
(function () {
  /* Curated Lucide icon paths (ISC licensed), inlined for reliable React rendering.
     Stroke-based, 24×24, stroke-width 1.75 to match the Cadence icon spec. */
  const PATHS = {
    "layout-dashboard": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "9",
      x: "3",
      y: "3",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "5",
      x: "14",
      y: "3",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "9",
      x: "14",
      y: "12",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "5",
      x: "3",
      y: "16",
      rx: "1"
    })),
    repeat: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m17 2 4 4-4 4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 11v-1a4 4 0 0 1 4-4h14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m7 22-4-4 4-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 13v1a4 4 0 0 1-4 4H3"
    })),
    calendar: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M8 2v4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 2v4"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "18",
      height: "18",
      x: "3",
      y: "4",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 10h18"
    })),
    "calendar-check": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M8 2v4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 2v4"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "18",
      height: "18",
      x: "3",
      y: "4",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 10h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m9 16 2 2 4-4"
    })),
    timer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10 2h4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 14v-4"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "14",
      r: "8"
    })),
    "chart-column": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 3v16a2 2 0 0 0 2 2h16"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M18 17V9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 17V5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 17v-3"
    })),
    settings: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    })),
    bell: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10.268 21a2 2 0 0 0 3.464 0"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
    })),
    plus: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14"
    })),
    play: /*#__PURE__*/React.createElement("path", {
      d: "M6 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 6 4.5z",
      fill: "currentColor",
      stroke: "none"
    }),
    "more-horizontal": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "19",
      cy: "12",
      r: "1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "5",
      cy: "12",
      r: "1"
    })),
    "chevron-right": /*#__PURE__*/React.createElement("path", {
      d: "m9 18 6-6-6-6"
    }),
    search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m21 21-4.3-4.3"
    })),
    sparkles: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
    })),
    coffee: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10 2v2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 2v2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 2v2"
    })),
    clock: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("polyline", {
      points: "12 6 12 12 16 14"
    })),
    "list-todo": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "5",
      width: "6",
      height: "6",
      rx: "1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m3 17 2 2 4-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 6h8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 12h8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 18h8"
    })),
    sunrise: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 2v8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m4.93 10.93 1.41 1.41"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 18h2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 18h2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m19.07 10.93-1.41 1.41"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 22H2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m8 6 4-4 4 4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 18a4 4 0 0 0-8 0"
    })),
    sun: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 20v2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m4.93 4.93 1.41 1.41"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m17.66 17.66 1.41 1.41"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 12h2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 12h2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m6.34 17.66-1.41 1.41"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m19.07 4.93-1.41 1.41"
    })),
    moon: /*#__PURE__*/React.createElement("path", {
      d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
    }),
    flag: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "4",
      x2: "4",
      y1: "22",
      y2: "15"
    })),
    "arrow-right": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m12 5 7 7-7 7"
    })),
    pencil: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m15 5 4 4"
    })),
    x: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M18 6 6 18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m6 6 12 12"
    })),
    "circle-check": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m9 12 2 2 4-4"
    })),
    "alarm-clock": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "13",
      r: "8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 9v4l2 2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 3 2 6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m22 6-3-3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6.38 18.7 4 21"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M17.64 18.67 20 21"
    }))
  };
  function Icon({
    name,
    size = 20,
    className = "",
    style
  }) {
    return /*#__PURE__*/React.createElement("svg", {
      className: className,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.75",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        flex: "none",
        ...style
      },
      "aria-hidden": "true"
    }, PATHS[name] || null);
  }
  window.Icon = Icon;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/Icon.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/ProgressScreen.jsx
try { (() => {
(function () {
  const {
    Card,
    DayChart,
    ProgressRing,
    Table,
    Badge
  } = window.CadenceDesignSystem_9c64df;
  function Stat({
    icon,
    label,
    value,
    sub
  }) {
    const Icon = window.Icon;
    return /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-md)",
        background: "var(--accent-quiet)",
        color: "var(--accent-text)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: icon
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--weight-semibold) var(--text-2xl)/1 var(--font-sans)",
        color: "var(--text-strong)"
      }
    }, value), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-body-sm)",
        color: "var(--text-muted)",
        marginTop: "2px"
      }
    }, label)), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-caption)",
        color: "var(--text-subtle)"
      }
    }, sub)));
  }
  function ProgressScreen() {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gap: "20px"
      }
    }, /*#__PURE__*/React.createElement(Stat, {
      icon: "circle-check",
      label: "Tasks done this week",
      value: "38",
      sub: "+6 vs last week"
    }), /*#__PURE__*/React.createElement(Stat, {
      icon: "timer",
      label: "Focus hours",
      value: "11.5",
      sub: "Across 14 blocks"
    }), /*#__PURE__*/React.createElement(Stat, {
      icon: "repeat",
      label: "Routine streak",
      value: "9 days",
      sub: "Morning routine"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr",
        gap: "20px",
        alignItems: "start"
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Header, {
      title: "This week",
      desc: "Tasks completed each day"
    }), /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        paddingTop: 0
      }
    }, /*#__PURE__*/React.createElement(DayChart, {
      height: 170,
      data: [{
        label: "Mon",
        value: 6
      }, {
        label: "Tue",
        value: 8
      }, {
        label: "Wed",
        value: 5
      }, {
        label: "Thu",
        value: 7
      }, {
        label: "Fri",
        value: 4
      }, {
        label: "Sat",
        value: 3,
        tone: "muted"
      }, {
        label: "Sun",
        value: 5,
        tone: "success"
      }]
    }))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        display: "flex",
        justifyContent: "space-around",
        padding: "24px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement(ProgressRing, {
      value: 82,
      max: 100,
      size: 104
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-body-sm)",
        color: "var(--text-muted)",
        marginTop: "10px"
      }
    }, "Week complete")), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement(ProgressRing, {
      value: 9,
      max: 10,
      size: 104,
      tone: "success"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-body-sm)",
        color: "var(--text-muted)",
        marginTop: "10px"
      }
    }, "Routines kept"))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Header, {
      title: "Recent days"
    }), /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        paddingTop: 0
      }
    }, /*#__PURE__*/React.createElement(Table, {
      columns: [{
        key: "day",
        header: "Day"
      }, {
        key: "tasks",
        header: "Tasks",
        align: "center"
      }, {
        key: "focus",
        header: "Focus",
        align: "center"
      }, {
        key: "status",
        header: "Status",
        align: "right",
        render: r => /*#__PURE__*/React.createElement(Badge, {
          tone: r.tone,
          dot: true
        }, r.status)
      }],
      rows: [{
        id: 1,
        day: "Today",
        tasks: "2 / 4",
        focus: "1h 10m",
        status: "In progress",
        tone: "accent"
      }, {
        id: 2,
        day: "Yesterday",
        tasks: "7 / 7",
        focus: "2h 30m",
        status: "Complete",
        tone: "success"
      }, {
        id: 3,
        day: "Wednesday",
        tasks: "5 / 6",
        focus: "1h 45m",
        status: "Mostly done",
        tone: "warning"
      }]
    }))));
  }
  window.ProgressScreen = ProgressScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/ProgressScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/RoutinesScreen.jsx
try { (() => {
(function () {
  const {
    Card,
    Badge,
    Button,
    ProgressRing,
    IconButton,
    Popover
  } = window.CadenceDesignSystem_9c64df;
  const ROUTINES = [{
    name: "Morning routine",
    time: "8:00 AM",
    steps: 5,
    done: 5,
    tag: "Daily",
    icon: "sunrise",
    tone: "success"
  }, {
    name: "Deep work",
    time: "10:30 AM",
    steps: 3,
    done: 1,
    tag: "Weekdays",
    icon: "timer",
    tone: "accent"
  }, {
    name: "Midday reset",
    time: "1:00 PM",
    steps: 4,
    done: 0,
    tag: "Daily",
    icon: "coffee",
    tone: "accent"
  }, {
    name: "Wind-down",
    time: "9:00 PM",
    steps: 6,
    done: 0,
    tag: "Daily",
    icon: "moon",
    tone: "accent"
  }];
  function RoutineCard({
    r
  }) {
    const Icon = window.Icon;
    const complete = r.done === r.steps;
    return /*#__PURE__*/React.createElement(Card, {
      interactive: true
    }, /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 44,
        height: 44,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-md)",
        background: "var(--accent-quiet)",
        color: "var(--accent-text)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: r.icon,
      size: 22
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-h3)",
        color: "var(--text-strong)"
      }
    }, r.name), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-body-sm)",
        color: "var(--text-muted)"
      }
    }, r.time, " \xB7 ", r.steps, " steps"))), /*#__PURE__*/React.createElement(Popover, {
      align: "end",
      trigger: /*#__PURE__*/React.createElement(IconButton, {
        size: "sm",
        icon: /*#__PURE__*/React.createElement(Icon, {
          name: "more-horizontal"
        }),
        "aria-label": "More"
      })
    }, /*#__PURE__*/React.createElement(Popover.Item, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "pencil"
      })
    }, "Edit"), /*#__PURE__*/React.createElement(Popover.Item, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "repeat"
      })
    }, "Schedule"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement(ProgressRing, {
      value: r.done,
      max: r.steps,
      size: 46,
      thickness: 5,
      tone: complete ? "success" : "accent",
      showLabel: false
    }, /*#__PURE__*/React.createElement(Icon, {
      name: complete ? "circle-check" : "flag",
      size: 18,
      style: {
        color: complete ? "var(--success-text)" : "var(--text-muted)"
      }
    })), /*#__PURE__*/React.createElement(Badge, {
      tone: complete ? "success" : "neutral",
      dot: complete
    }, complete ? "Done today" : `${r.done}/${r.steps}`), /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, r.tag)), /*#__PURE__*/React.createElement(Button, {
      variant: complete ? "ghost" : "secondary",
      size: "sm",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: complete ? "circle-check" : "play"
      })
    }, complete ? "Review" : "Start"))));
  }
  function RoutinesScreen() {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px"
      }
    }, ROUTINES.map(r => /*#__PURE__*/React.createElement(RoutineCard, {
      key: r.name,
      r: r
    })));
  }
  window.RoutinesScreen = RoutinesScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/RoutinesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/TodayScreen.jsx
try { (() => {
(function () {
  const {
    Card,
    Checklist,
    ProgressBar,
    ProgressRing,
    Timer,
    List,
    Badge,
    Button,
    Chip
  } = window.CadenceDesignSystem_9c64df;
  function SectionLabel({
    children,
    right
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--font-caption)",
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-wide)",
        color: "var(--text-subtle)"
      }
    }, children), right);
  }
  function TodayScreen({
    items,
    onToggle,
    goFocus
  }) {
    const Icon = window.Icon;
    const [filter, setFilter] = React.useState("all");
    const done = items.filter(i => i.done).length;
    const shown = filter === "all" ? items : items.filter(i => filter === "done" ? i.done : !i.done);
    const upNext = [{
      title: "Deep work block",
      meta: "10:30 AM · 45 min",
      tone: "accent",
      tag: "Focus"
    }, {
      title: "Lunch + medication",
      meta: "1:00 PM · 30 min",
      tone: "warning",
      tag: "Health"
    }, {
      title: "Check in with Jess",
      meta: "3:30 PM · 15 min",
      tone: "info",
      tag: "Call"
    }];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.5fr 1fr",
        gap: "20px",
        alignItems: "start"
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Header, {
      title: "Today's plan",
      desc: `${done} of ${items.length} done · one step at a time`,
      action: /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: "6px"
        }
      }, ["all", "todo", "done"].map(f => /*#__PURE__*/React.createElement(Chip, {
        key: f,
        selected: filter === f,
        onClick: () => setFilter(f)
      }, f[0].toUpperCase() + f.slice(1))))
    }), /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        paddingTop: 0
      }
    }, /*#__PURE__*/React.createElement(Checklist, {
      items: shown,
      onToggle: onToggle
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "14px",
        paddingTop: "16px",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement(ProgressBar, {
      value: done,
      max: items.length,
      showCount: true,
      label: "Daily progress",
      tone: done === items.length ? "success" : "accent"
    }))), /*#__PURE__*/React.createElement(Card.Footer, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "plus"
      })
    }, "Add a task"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px"
      }
    }, /*#__PURE__*/React.createElement(SectionLabel, null, "Next focus block"), /*#__PURE__*/React.createElement(Timer, {
      durationSec: 1500,
      label: "Focus"
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      fullWidth: true,
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "play"
      }),
      onClick: goFocus
    }, "Open focus mode"))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Card.Header, {
      title: "Up next",
      desc: "The rest of your day, in order"
    }), /*#__PURE__*/React.createElement(Card.Body, {
      style: {
        paddingTop: 0
      }
    }, /*#__PURE__*/React.createElement(List, null, upNext.map((u, i) => /*#__PURE__*/React.createElement(List.Item, {
      key: i,
      interactive: true,
      leading: /*#__PURE__*/React.createElement("span", {
        style: {
          width: 8,
          height: 8,
          borderRadius: 999,
          background: `var(--${u.tone === "accent" ? "accent" : u.tone + "-solid"})`
        }
      }),
      title: u.title,
      meta: u.meta,
      trailing: /*#__PURE__*/React.createElement(Badge, {
        tone: u.tone
      }, u.tag)
    }))))));
  }
  window.TodayScreen = TodayScreen;
  window.SectionLabel = SectionLabel;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/TodayScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.List = __ds_scope.List;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Checklist = __ds_scope.Checklist;

__ds_ns.DayChart = __ds_scope.DayChart;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.ProgressRing = __ds_scope.ProgressRing;

__ds_ns.Timer = __ds_scope.Timer;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Popover = __ds_scope.Popover;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Slider = __ds_scope.Slider;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Breadcrumbs = __ds_scope.Breadcrumbs;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
