// Initial data from CSV files

export const initialClientes = [
  { id: 1, nombre: 'Xeraco Aso. UDP Jub y pen', cif: 'G-98124084', direccion: 'C/Consell s/n', poblacion: 'Xeraco', cp: '46770', provincia: 'Valencia' },
  { id: 2, nombre: 'Benicalap centro activ ayun.', cif: 'P-46000188 -I', direccion: 'C/GENERAL Llorens 33', poblacion: 'Benicalap', cp: '46025', provincia: 'Valencia' },
  { id: 3, nombre: 'Lombai Asociación , UDP', cif: 'G 97566996', direccion: 'C/ Valencia 21', poblacion: 'Llombai', cp: '46195', provincia: 'Valencia' },
  { id: 4, nombre: 'Arrancapins centro activ ayun.', cif: 'P- 4600168 A', direccion: 'C/ Historiador Diago, 68', poblacion: 'Valencia', cp: '46007', provincia: 'Valencia' },
  { id: 5, nombre: 'Alpuente aso. UDP Jub y pen', cif: 'G-9617261', direccion: 'C/ Valencia 21', poblacion: 'Alpuente', cp: '46178', provincia: 'Valencia' },
  { id: 6, nombre: 'La Venta del Moro Aso. Jub y pen', cif: 'G - 9830279', direccion: 'C/ Victorio Montes , 42', poblacion: 'La Venta del Moro', cp: '46310', provincia: 'Valencia' },
  { id: 7, nombre: 'Museros Aso,jubi, y pens, UDP', cif: 'G-97898910', direccion: 'C/ Escuelas viejas 1', poblacion: 'Museros', cp: '46136', provincia: 'Valencia' },
  { id: 8, nombre: 'Puzol Aso. UDP Jubi y pen', cif: 'G97455695', direccion: 'Paza pais valenciano25', poblacion: 'Puzol', cp: '46530', provincia: 'Valencia' },
  { id: 9, nombre: 'Aso. Sagunto AVAT jub y pen', cif: 'G-46446613', direccion: 'C/General Canin,22 bajo', poblacion: 'Sagunto', cp: '46500', provincia: 'Valencia' },
  { id: 10, nombre: 'Aso.Sollana UDP Jub y pen', cif: 'G-97844724', direccion: 'C/Doctor Vera Verdu,17', poblacion: 'Sollana', cp: '46430', provincia: 'Valencia' },
]

export const initialCRMClientes = [
  { id: 1, cliente: 'Alcira Jubilados Jucar', movil: '650 936 907', responsable: 'Raül', direccion: 'Santos Patronos, 9', cp: '46600', poblacion: 'Alzira', provincia: 'Valencia', nSocios: 600, proximaVisita: '2025-12-15T11:15:00', email: '', telCentro: '' },
  { id: 2, cliente: 'Arrancapins', movil: '613 000 148', responsable: 'Luis Mico', direccion: 'Historiador Diago', cp: '', poblacion: 'Valencia', provincia: '', nSocios: null, proximaVisita: '2025-12-16T13:00:00', email: '', telCentro: '' },
  { id: 3, cliente: 'Algemesi jubilados', movil: '610 953 359', responsable: 'Miguel Angel', direccion: '', cp: '', poblacion: '', provincia: '', nSocios: null, proximaVisita: null, email: 'jubilatsalgemesi@gmail.com', telCentro: '96 242 25 61' },
  { id: 4, cliente: 'Alpuente', movil: '638 725 227', responsable: 'Maria', direccion: '', cp: '', poblacion: 'Alpuente', provincia: 'Valencia', nSocios: null, proximaVisita: null, email: '', telCentro: '' },
  { id: 5, cliente: 'Centro Mayores Cullera', movil: '628914036', responsable: 'Carmen y Janin', direccion: '', cp: '', poblacion: '', provincia: '', nSocios: null, proximaVisita: null, email: '', telCentro: '' },
  { id: 6, cliente: 'Centro social 9 de octubre Manises', movil: '625 052 312', responsable: 'Mª Paz', direccion: '', cp: '', poblacion: '', provincia: '', nSocios: null, proximaVisita: null, email: 'centrosocial9deoctubre@gmail.com', telCentro: '961 522 200' },
  { id: 7, cliente: 'Carcaixent Jubilados', movil: '637 768 264', responsable: 'Antonio', direccion: 'Pza España s/n', cp: '46740', poblacion: 'Carcaixent', provincia: 'Valencia', nSocios: null, proximaVisita: null, email: '', telCentro: '962 46 71 40' },
  { id: 8, cliente: 'Vicur', movil: '676 992 491', responsable: 'Jose Perales', direccion: '', cp: '', poblacion: '', provincia: '', nSocios: null, proximaVisita: null, email: 'vicuralmassora@hotmail.com', telCentro: '' },
  { id: 9, cliente: 'Villalonga jubilados', movil: '653 650 069', responsable: 'Tere', direccion: '', cp: '', poblacion: '', provincia: '', nSocios: null, proximaVisita: null, email: 'pensionistesvillalonga@gmail.com', telCentro: '' },
]

export const initialPlanning = [
  { id: 1, grupo: 'ARRANCAPINS', destino: 'LA ALCARRIA', fecha: 'DEL 16 AL 18 ENERO', hotel: '', plazas: '34 pax', bus: 'Rutas Rodriguez', precioBus: '2000', trimestre: '1' },
  { id: 2, grupo: 'VIVEROS', destino: 'BENICARLO', fecha: '25 DE ENERO', hotel: 'CASA TERE', plazas: '15+10pax', bus: '', precioBus: '', trimestre: '1' },
  { id: 3, grupo: 'a/c Godella', destino: 'ENAMORADOS', fecha: 'HOTEL EN SALOU', hotel: '', plazas: '15 pax', bus: '', precioBus: '', trimestre: '1' },
  { id: 4, grupo: 'A/C XERACO', destino: 'ENAMORADOS GRANADA', fecha: '13 AL 15 FEBRERO', hotel: 'HOTEL ABADES', plazas: '25pax', bus: '', precioBus: '', trimestre: '1' },
  { id: 5, grupo: 'ALPUENTE', destino: 'BENIDORM', fecha: '15AL 20 FEBRERO', hotel: 'HOTEL AVENIDA', plazas: '', bus: '', precioBus: '', trimestre: '1' },
  { id: 6, grupo: 'A/C PUIG', destino: 'CARNAVALES', fecha: '14 AL 17 FEBRERO', hotel: 'HOTEL EN JEREZ', plazas: '34pax', bus: '', precioBus: '', trimestre: '1' },
  { id: 7, grupo: 'ALBIR', destino: 'GALICIA', fecha: '31/05AL 05/06', hotel: 'HOTEL OLIMPO 4****', plazas: '20 pax', bus: '', precioBus: '', trimestre: '2' },
  { id: 8, grupo: 'Vilamarxant', destino: 'GALICIA', fecha: 'DEL 01 AL 07 DE JUNIO', hotel: '', plazas: '', bus: '', precioBus: '', trimestre: '2' },
  { id: 9, grupo: 'SAN JOAN DE MORO', destino: 'PORTUGAL', fecha: 'DEL 15 AL 20 DE AGOSTO', hotel: 'HOTEL AVENIDA Y CORONA SOL', plazas: '', bus: '', precioBus: '', trimestre: '3' },
]
