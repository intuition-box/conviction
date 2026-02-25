import type { InputHTMLAttributes } from "react";

import styles from "./TextInput.module.css";

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, ...props }: TextInputProps) {
  const classes = [styles.input, className].filter(Boolean).join(" ");
  return <input className={classes} {...props} />;
}
