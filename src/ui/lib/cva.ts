import { cn } from "./utils";

export type VariantProps<T extends (...args: any) => any> = Parameters<T>[0];

export function cva(base?: string, config?: { variants?: Record<string, Record<string, string>>; defaultVariants?: Record<string, string> }) {
  return (props?: Record<string, any>) => {
    const classes = [base];
    const variants = config?.variants || {};
    const defaults = config?.defaultVariants || {};
    for (const key of Object.keys(variants)) {
      const val = props?.[key] ?? defaults[key];
      if (val && variants[key]?.[val]) {
        classes.push(variants[key][val]);
      }
    }
    if (props?.className) classes.push(props.className);
    return cn(...classes);
  };
}
