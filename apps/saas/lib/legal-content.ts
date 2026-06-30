export type LegalSection = { title: string; body: string }

export const canalCorporativo: LegalSection[] = [
  {
    title: 'Naturaleza del servicio',
    body: 'TakeasyGO es una plataforma tecnológica que permite a restaurantes gestionar sus pedidos. En el marco del Canal Corporativo, las empresas pueden habilitar a sus empleados para realizar pedidos en restaurantes adheridos bajo modalidades de beneficio acordadas directamente entre la empresa y el restaurante.',
  },
  {
    title: 'Datos a los que accede la empresa',
    body: 'A través del panel corporativo, la empresa podrá visualizar: nombre del empleado habilitado, correo electrónico corporativo, pedidos realizados (detalle de productos, fecha y hora), monto de cada pedido y reportes consolidados. La empresa NO accede a datos de otros clientes del restaurante ajenos a su nómina habilitada.',
  },
  {
    title: 'Finalidad del acceso',
    body: 'La empresa accede a dichos datos con una finalidad exclusiva: administrar el beneficio gastronómico, controlar y conciliar el consumo a efectos de facturación, y gestionar la nómina de empleados habilitados. Queda expresamente prohibido utilizar los datos para vigilancia laboral, venta a terceros, perfilamiento comercial o cualquier propósito distinto al enunciado.',
  },
  {
    title: 'Responsabilidad de la empresa',
    body: 'Al acceder al Canal Corporativo, la empresa asume el carácter de co-responsable del tratamiento de los datos de sus empleados. Se compromete a utilizar los datos exclusivamente para los fines declarados, mantener la confidencialidad de las credenciales de acceso, notificar incidentes de seguridad, y respetar los derechos de acceso, rectificación y supresión de los empleados.',
  },
  {
    title: 'Seguridad y confidencialidad',
    body: 'TakeasyGO garantiza que el acceso al panel corporativo está protegido por autenticación segura, los datos viajan cifrados entre el cliente y los servidores, y no existe acceso cruzado entre empresas. La empresa se compromete a mantener confidencialidad sobre toda la información a la que acceda a través del panel.',
  },
]

export const terminos: LegalSection[] = [
  {
    title: '1. Aceptación de Términos',
    body: 'Al realizar un pedido a través de nuestra plataforma, aceptás estos términos y condiciones en su totalidad. Si no estás de acuerdo con alguna parte de estos términos, no debés utilizar nuestro servicio.',
  },
  {
    title: '2. Pedidos y Pagos',
    body: 'Todos los pedidos están sujetos a disponibilidad. Los precios mostrados incluyen IVA. El pago se realiza a través de MercadoPago, una plataforma segura de procesamiento de pagos.',
  },
  {
    title: '3. Retiro del Pedido',
    body: 'Los pedidos deben ser retirados en el local dentro del horario de atención. Recibirás una notificación cuando tu pedido esté listo para ser retirado.',
  },
  {
    title: '4. Cancelaciones y Reembolsos',
    body: 'Las cancelaciones deben solicitarse antes de que el pedido entre en preparación. Los reembolsos se procesarán a través del mismo medio de pago utilizado.',
  },
  {
    title: '5. Modificaciones',
    body: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. Las modificaciones entrarán en vigor inmediatamente después de su publicación.',
  },
]

export const privacidad: LegalSection[] = [
  {
    title: 'Información que Recopilamos',
    body: 'Recopilamos la información que nos proporcionás al realizar un pedido: nombre, teléfono, email y dirección de entrega cuando corresponda.',
  },
  {
    title: 'Uso de la Información',
    body: 'Utilizamos tu información únicamente para procesar tus pedidos, comunicarnos con vos sobre el estado de tu orden y mejorar nuestros servicios.',
  },
  {
    title: 'Almacenamiento de Datos',
    body: 'Si elegís la opción "Recordar mis datos", tu información se almacena localmente en tu dispositivo para facilitar futuras compras. No compartimos tus datos con terceros.',
  },
  {
    title: 'Procesamiento de Pagos',
    body: 'Los pagos se procesan a través de MercadoPago. No almacenamos información de tarjetas de crédito ni datos bancarios en nuestros servidores.',
  },
  {
    title: 'Tus Derechos',
    body: 'Tenés derecho a acceder, rectificar o eliminar tus datos personales. Para ejercer estos derechos, contactanos directamente.',
  },
  {
    title: 'Contacto',
    body: 'Si tenés preguntas sobre nuestra política de privacidad, podés contactarnos a través de nuestras redes sociales o directamente en el local.',
  },
]
