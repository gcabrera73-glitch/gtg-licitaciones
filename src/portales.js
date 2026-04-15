const PORTALES = [
  // FEDERALES Y CDMX
  { url: 'https://upcp-compranet.buengobierno.gob.mx/sitiopublico/', nombre: 'ComprasMX (CompraNet Federal)', categoria: 'Federal' },
  { url: 'https://dof.gob.mx/#gsc.tab=0', nombre: 'Diario Oficial de la Federación', categoria: 'Federal' },
  { url: 'https://comprasmx.buengobierno.gob.mx/panel/#/', nombre: 'ComprasMX Panel', categoria: 'Federal' },
  { url: 'https://concursodigital.finanzas.cdmx.gob.mx/convocatorias_publicas#middle', nombre: 'Concurso Digital CDMX', categoria: 'CDMX' },
  { url: 'https://www.c5.cdmx.gob.mx/convocatorias/licitaciones', nombre: 'C5 CDMX', categoria: 'CDMX' },
  { url: 'https://portalanterior.ine.mx/archivos3/portal/historico/contenido/interiores/Menu_Principal-id-9db0c2ec3d355010VgnVCM1000002c01000aRCRD/', nombre: 'INE', categoria: 'Federal' },
  // { url: 'https://fonacot.gob.mx/nosotros/basesLicitaciones/licitacionespublicas/2022/Paginas/Proyecto-de-Bases.aspx', nombre: 'FONACOT', categoria: 'Federal' }, // historial 2022

  // SECTOR SALUD
  // { url: 'http://hjm.salud.gob.mx/interna/licitaciones/licitaciones.html', nombre: 'Hospital Juárez de México', categoria: 'Salud' }, // portal abandonado
  { url: 'https://www.pediatria.gob.mx/interna/licita.html', nombre: 'Hospital Infantil de México', categoria: 'Salud' },
  { url: 'https://cibnor.mx/proyectos-y-convocatorias-licitacion-laassp-lopsrm', nombre: 'CIBNOR', categoria: 'Salud' },

  // ESTADOS
  { url: 'https://egobierno2.aguascalientes.gob.mx/servicios/LicitacionesEstatales/ui/dependencia.aspx?i=64', nombre: 'Aguascalientes', categoria: 'Estado' },
  { url: 'https://tramites.ebajacalifornia.gob.mx/Compras/Licitaciones', nombre: 'Baja California', categoria: 'Estado' },
  { url: 'https://compranet.bcs.gob.mx:8443/app/portal', nombre: 'Baja California Sur', categoria: 'Estado' },
  { url: 'https://safin.campeche.gob.mx/convocatorias/estatales', nombre: 'Campeche', categoria: 'Estado' },
  { url: 'https://www.seinfra.chiapas.gob.mx/licitaciones.php', nombre: 'Chiapas', categoria: 'Estado' },
  { url: 'https://chihuahua.gob.mx/info/licitaciones', nombre: 'Chihuahua', categoria: 'Estado' },
  { url: 'https://secop.col.gob.mx/secop/detalle_comite/MTU=', nombre: 'Colima SECOP', categoria: 'Estado' },
  { url: 'https://comprasestatal.durango.gob.mx/consulta/ProcedimientosDeContratacion', nombre: 'Durango', categoria: 'Estado' },
  { url: 'https://transparencia.guanajuato.gob.mx/transparencia/informacion_publica_licitaciones.php', nombre: 'Guanajuato', categoria: 'Estado' },
  { url: 'https://compranet.guerrero.gob.mx/expedientespublicos.aspx', nombre: 'Guerrero', categoria: 'Estado' },
  { url: 'https://eoficialia.hidalgo.gob.mx/LICITACIONES/VISTAS/WebFrmLC004.aspx', nombre: 'Hidalgo', categoria: 'Estado' },
  { url: 'https://oficialiamayor.hidalgo.gob.mx/Licitaciones', nombre: 'Hidalgo Oficialía Mayor', categoria: 'Estado' },
  { url: 'https://compras.jalisco.gob.mx/requisition/tree?group=007', nombre: 'Jalisco TI', categoria: 'Estado' },
  { url: 'https://transparencia.guadalajara.gob.mx/licitaciones2025', nombre: 'Guadalajara Municipio', categoria: 'Municipio' },
  { url: 'https://sip.cadpe.michoacan.gob.mx/CADPE/#/procedimientos', nombre: 'Michoacán', categoria: 'Estado' },
  { url: 'https://compras.morelos.gob.mx/licitaciones-2025', nombre: 'Morelos', categoria: 'Estado' },
  { url: 'https://www.hacienda-nayarit.gob.mx/ConvLicitacion.html', nombre: 'Nayarit', categoria: 'Estado' },
  { url: 'https://nl.gob.mx/es/licitaciones-dependencias-centrales', nombre: 'Nuevo León', categoria: 'Estado' },
  { url: 'https://www.monterrey.gob.mx/transparencia/Oficial_/Convocatorias.html', nombre: 'Monterrey Municipio', categoria: 'Municipio' },
  { url: 'https://www.oaxaca.gob.mx/administracion/licitaciones/', nombre: 'Oaxaca', categoria: 'Estado' },
  { url: 'https://licitaciones.puebla.gob.mx/', nombre: 'Puebla', categoria: 'Estado' },
  { url: 'https://licitaciones.puebla.gob.mx/index.php/aquisiciones-bienes-y-servicios/convocatorias-aquisiciones-bienes-y-servicios', nombre: 'Puebla Adquisiciones', categoria: 'Estado' },
  // { url: 'https://municipiodequeretaro.gob.mx/licitaciones/publicas-municipales/', nombre: 'Querétaro Municipal', categoria: 'Municipio' }, // solo historial
  // { url: 'https://municipiodequeretaro.gob.mx/licitaciones/publicas-nacionales/', nombre: 'Querétaro Nacional', categoria: 'Municipio' }, // solo historial
  // { url: 'https://municipiodequeretaro.gob.mx/licitaciones/federales/', nombre: 'Querétaro Federales', categoria: 'Municipio' }, // solo historial
  // { url: 'https://qroo.gob.mx/sema/licitaciones/', nombre: 'Quintana Roo', categoria: 'Estado' }, // solo historial
  { url: 'https://sitio.sanluis.gob.mx/SanLuisPotoSi/LicitacionesPublicas2', nombre: 'San Luis Potosí', categoria: 'Estado' },
  { url: 'https://sitio.sanluis.gob.mx/SanLuisPotoSi/Compras2', nombre: 'San Luis Potosí Compras', categoria: 'Estado' },
  { url: 'https://compranet.sinaloa.gob.mx/secretaria-de-administracion-y-finanzas-ges', nombre: 'Sinaloa Adm. General', categoria: 'Estado' },
  { url: 'https://compranet.sinaloa.gob.mx/secretaria-de-obras-publicas', nombre: 'Sinaloa Obras Públicas', categoria: 'Estado' },
  { url: 'https://compranet.sinaloa.gob.mx/secretaria-de-administracion-y-finanzas-saf', nombre: 'Sinaloa SAF', categoria: 'Estado' },
  { url: 'https://compranet.sinaloa.gob.mx/secretaria-de-turismo', nombre: 'Sinaloa Turismo', categoria: 'Estado' },
  { url: 'https://compranet.sinaloa.gob.mx/sistema-estatal-de-seguridad-publica-sesesp', nombre: 'Sinaloa SESESP', categoria: 'Estado' },
  { url: 'https://compranetv2.sonora.gob.mx/inicio/portal-licitaciones', nombre: 'Sonora', categoria: 'Estado' },
  { url: 'https://portalanticorrupcion.tabasco.gob.mx:85/compranet/Publico/Licitacion_Adquisiciones/Adq_Vigentes.aspx', nombre: 'Tabasco', categoria: 'Estado' },
  { url: 'https://www.tamaulipas.gob.mx/licitaciones/', nombre: 'Tamaulipas', categoria: 'Estado' },
  { url: 'https://sefintlax.gob.mx/portalsf/index.php/licitaciones', nombre: 'Tlaxcala Finanzas', categoria: 'Estado' },
  { url: 'https://af-oficina-virtual.sefintlax.gob.mx/bases-licitaciones-adquisiciones/', nombre: 'Tlaxcala Adquisiciones', categoria: 'Estado' },
  { url: 'https://www.veracruz.gob.mx/infraestructura/licitaciones-federales-2026/', nombre: 'Veracruz Federal', categoria: 'Estado' },
  { url: 'https://www.veracruz.gob.mx/infraestructura/licitaciones-estatales-2026/', nombre: 'Veracruz Estatal', categoria: 'Estado' },
  { url: 'https://adquisiciones.yucatan.gob.mx/#/convocatorias', nombre: 'Yucatán', categoria: 'Estado' },
  { url: 'https://adquisiciones.yucatan.gob.mx/#/concursos-electronicos', nombre: 'Yucatán Electrónico', categoria: 'Estado' },
  { url: 'https://funcionpublica.zacatecas.gob.mx/licitaciones', nombre: 'Zacatecas', categoria: 'Estado' },
  { url: 'https://edomex.gob.mx/licitaciones_enlinea', nombre: 'Estado de México', categoria: 'Estado' },
  { url: 'https://compramex.edomex.gob.mx/compramex/public/catalogosExternos/procedimientsoAdquisitivos.xhtml', nombre: 'EDOMEX COMPRAMEX', categoria: 'Estado' },
  { url: 'https://transparenciafiscal.edomex.gob.mx/convocatorias_licitaciones', nombre: 'EDOMEX Transparencia Fiscal', categoria: 'Estado' },

  // UNIVERSIDADES
  { url: 'https://www.proveeduria.unam.mx/app.dgpr/', nombre: 'UNAM', categoria: 'Universidad' },
  { url: 'https://cgsait.udg.mx/csg/licitaciones', nombre: 'UdeG', categoria: 'Universidad' },
  { url: 'https://dapi.buap.mx/licitaciones', nombre: 'BUAP', categoria: 'Universidad' },
  { url: 'https://www.uaeh.edu.mx/transparencia/proyectos-obras-licitaciones/lic2026.html', nombre: 'UAEH', categoria: 'Universidad' },
  { url: 'https://intranet2.ugto.mx/AdquisicionesUG/adquisiciones/documentos?tab=0', nombre: 'Universidad de Guanajuato', categoria: 'Universidad' },
  { url: 'https://umich.mx/convocatorias/', nombre: 'UMICH', categoria: 'Universidad' },
  { url: 'https://www.uan.edu.mx/es/drm', nombre: 'UAN Nayarit', categoria: 'Universidad' },
  { url: 'https://seaarm.uienl.edu.mx/seaarm/', nombre: 'UANL', categoria: 'Universidad' },
  { url: 'https://www.uaslp.mx/SecretariaAdministrativa/Paginas/Licitaciones/9515#gsc.tab=0', nombre: 'UASLP', categoria: 'Universidad' },
  { url: 'https://dcbi.uas.edu.mx/2026.html', nombre: 'UAS Sinaloa', categoria: 'Universidad' },
  { url: 'https://portal.ucol.mx/proveeduria/', nombre: 'Universidad de Colima', categoria: 'Universidad' },
  { url: 'https://cofaa.ipn.mx/adquisiciones.html', nombre: 'IPN', categoria: 'Universidad' },
  { url: 'https://adquisicionesyobrapublica.uaa.mx/', nombre: 'UAA Aguascalientes', categoria: 'Universidad' },
  { url: 'https://uach.mx/licitaciones/da/', nombre: 'UACH Chihuahua', categoria: 'Universidad' },
  { url: 'https://dia.unison.mx/licitaciones-vigentes/', nombre: 'UNISON Sonora', categoria: 'Universidad' },
  { url: 'https://www.ujat.mx/dirsmateriales/25245', nombre: 'UJAT Tabasco', categoria: 'Universidad' },
  { url: 'https://licitaciones.uady.mx/', nombre: 'UADY Yucatán', categoria: 'Universidad' },
  { url: 'https://www.uabjo.mx/agenda/convocatoria-de-las-licitaciones-publicas', nombre: 'UABJO Oaxaca', categoria: 'Universidad' },
  { url: 'https://www.uadec.mx/licitaciones/', nombre: 'UAdeC Coahuila', categoria: 'Universidad' },
  { url: 'https://www.uqroo.mx/intranet/convocatorias/', nombre: 'UQRoo', categoria: 'Universidad' },
  { url: 'https://www.uacam.mx/convocatorias/listado', nombre: 'UACAM Campeche', categoria: 'Universidad' },
];

module.exports = PORTALES;
