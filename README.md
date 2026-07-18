# taller_gestor
Gestor integral de taller. 

Marca Blanca y Configuración General: El sistema ahora se llama GITaller (o el nombre que el administrador decida), permite subir un logotipo personalizado y define sus propios horarios de apertura y almuerzo dinámicamente.

Motor Cron Inteligente: Los cortes y pausas automáticas ya no están fijos en el código, sino que leen la base de datos y respetan si el taller trabaja de corrido o tiene pausas.

Matemáticas Financieras y Operativas: Los cálculos de tiempo ocioso y horas hábiles se adaptan a la configuración del taller.

Sistema de Bonificaciones: Interfaz para aplicar descuentos en porcentajes, impactando el monto exacto en la base de datos y visibilizando la "Pérdida por Descuentos" en el tablero de métricas.

Flujo Colaborativo (Mecánicos): Separación estricta entre la "Causa" (compartida por toda la OT) y la "Reparación" (el aporte individual).

Cierres Forzados: Capacidad del Jefe de Taller de cerrar actividades colgadas, habilitando el botón "Informar" para que el mecánico rinda cuentas sin trabar el flujo.

UX Mecánico: Agrupación visual de todas las tareas bajo una única tarjeta maestra por vehículo, limpiando drásticamente la pantalla.

Normalización de Base de Datos: Buscadores inteligentes sin regex forzados para estandarizar el ingreso de modelos de unidades.

Seguridad y Accesibilidad: Alertas de Bloq Mayús y visores de contraseña en el Login.
