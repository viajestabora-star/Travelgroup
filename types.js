export interface Observation {
    id: string;
    fecha: string;
    viaje: string;
    bonificacion: string;
  }
  
  export interface Proposal {
    id: string;
    clientId: string;
    clientName: string;
    titulo: string;      
    fecha: string;       
    cuando: string;      
    presupuesto: string; 
    estado: 'NUEVA' | 'EN_PROCESO' | 'HECHO';
    prioridad: 'NORMAL' | 'URGENTE';
    descripcion: string;
  }
  
  export interface Visit {
    id: string;
    clientId: string;
    clientName: string;
    fecha: string; 
    hora: string;
    poblacion: string;
  }
  
  export interface Client {
    id: string;
    grupo: string;
    responsable: string;
    movil: string;
    fechaVisita: string;
    horaVisita: string;
    nSocios: string;
    cif: string;
    direccion: string;
    cp: string;
    poblacion: string;
    provincia: string;
    telCentro: string;
    mail: string;
    status: 'Activo' | 'Inactivo' | 'Contactado';
    color: string;
    meses: string;
    tipoViajes: string;
    capacidadViaje: string;
    puntosRecogida: string;
    observaciones: Observation[];
    propuestas: Proposal[];
    comentarios: string;
  }
  
  export type ViewState = 'HOME' | 'CLIENTS' | 'AGENDA' | 'NOTAS' | 'EDIT_CLIENT';