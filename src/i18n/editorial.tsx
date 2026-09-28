"use client";

import type { ComponentProps, ReactNode } from "react";
import * as React from "react";
import {
  ActionButton as BaseActionButton,
  MetricControl as BaseMetricControl,
  PanelSection as BasePanelSection,
  PanelWrapper as BasePanelWrapper,
  SegmentedControl as BaseSegmentedControl,
  SliderControl as BaseSliderControl,
  ToggleControl as BaseToggleControl,
} from "@pascal-app/editor";
import { ts } from "./index";

export { ts } from "./index";

/**
 * Envoltura de los controles que muestran texto del editor.
 *
 * Los paneles de `@pascal-app/nodes` importan estos componentes del paquete
 * `@pascal-app/editor`. Con un unico cambio de linea en ese import (de
 * `'@pascal-app/editor'` a `'@/i18n/editorial'`) todos los textos de ese
 * panel pasan por aqui y salen en espanol, sin editar string por string.
 *
 * Solo se traducen props de presentacion (`title`, `label`). Los valores
 * internos (`value`, `trimKey`, `onChange`) pasan intactos.
 */

type Props<C extends React.ComponentType<any>> = ComponentProps<C>;

function nodo(texto: ReactNode): ReactNode {
  return typeof texto === "string" ? ts(texto) : texto;
}

export function PanelWrapper(props: Props<typeof BasePanelWrapper>) {
  return <BasePanelWrapper {...props} title={ts(props.title)} />;
}

export function PanelSection(props: Props<typeof BasePanelSection>) {
  return <BasePanelSection {...props} title={ts(props.title)} />;
}

export function ActionButton(props: Props<typeof BaseActionButton>) {
  return <BaseActionButton {...props} label={ts(props.label)} />;
}

export function SliderControl(props: Props<typeof BaseSliderControl>) {
  return <BaseSliderControl {...props} label={nodo(props.label)} />;
}

export function MetricControl(props: Props<typeof BaseMetricControl>) {
  return <BaseMetricControl {...props} label={nodo(props.label)} />;
}

export function ToggleControl(props: Props<typeof BaseToggleControl>) {
  return <BaseToggleControl {...props} label={ts(props.label)} />;
}

export function SegmentedControl<T extends string = string>(
  props: Props<typeof BaseSegmentedControl<T>>,
) {
  const options = props.options.map((o) => ({ ...o, label: nodo(o.label) }));
  return <BaseSegmentedControl<T> {...props} options={options} />;
}

/**
 * Reexporta todo lo demas del editor sin cambios: utilidades, hooks, stores
 * y los tipos que usan los paneles.
 */
export * from "@pascal-app/editor";
