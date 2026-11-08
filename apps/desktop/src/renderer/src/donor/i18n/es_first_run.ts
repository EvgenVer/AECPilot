/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_first_run.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { FirstRunCopy } from './types_first_run'

export const esFirstRun: FirstRunCopy = {
  beats: {
    name: 'Nombre',
    theme: 'Color de acento',
    layout: 'Diseño',
    connectors: 'Apps',
    plugins: 'Plugins',
    tour: 'Recorrido',
    build: 'Primera tarea'
  },
  namePlaceholder: 'Tu nombre',
  useName: name => `Usar «${name}»`,
  install: 'Instalar',
  installed: 'Instalado',
  loading: 'Cargando…',
  noPlugins: 'No hay plugins para mostrar ahora mismo.',
  noneChosen: 'Ninguno',
  noAnswer: 'Sin respuesta',
  answerRefused: 'Respuesta no aceptada',
  tours: {
    quick: 'Recorrido rápido',
    full: 'Muéstramelo todo',
    skip: 'Omitir, construyamos algo'
  },
  skippedAll: 'Configuración omitida',
  skip: 'Omitir configuración',
  skipTip: 'Termina la configuración guiada y abre un chat nuevo.',
  skipFailed: 'No se pudo omitir la configuración',
  slashOffTitle: 'Los comandos con barra no están disponibles durante la configuración',
  slashOffBody: 'Funcionarán con normalidad cuando termine la configuración.',
  localModel: {
    title: 'Este ordenador puede ejecutar un modelo localmente',
    text: (model, size) =>
      `${model} (${size}) encaja con tu hardware. Funciona gratis y tus chats se quedan en este ordenador.`,
    setUp: 'Configurarlo',
    notNow: 'Ahora no'
  },
  intro: {
    greeting: 'Hola, soy Hermes.',
    plan: 'Vamos a dejarlo todo listo para ti. Luego haremos algo genial.'
  },
  rerun: {
    title: 'Repetir la configuración inicial',
    description: 'Abre un nuevo chat de configuración que recorre los primeros pasos con tu modelo actual.',
    action: 'Repetir',
    failed: 'No se pudo iniciar la configuración inicial'
  }
}
