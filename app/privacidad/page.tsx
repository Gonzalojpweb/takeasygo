export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white font-geist antialiased selection:bg-orange-500/10 selection:text-orange-600">
      <main className="max-w-4xl mx-auto px-5 py-20 text-zinc-800">
        <h1 className="text-3xl md:text-5xl font-black mb-8 text-zinc-900 uppercase">Aviso de Privacidad</h1>
        
        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Protección de Datos Personales</h2>
            <p>
              En TakeasyGO (en adelante, “la Plataforma” o “nosotros”), respetamos su privacidad y estamos comprometidos a proteger los datos personales de nuestros usuarios, clientes y visitantes.
            </p>
            <p className="mt-4">
              Este Aviso de Privacidad explica cómo recolectamos, utilizamos, almacenamos y protegemos la información que usted nos proporciona, conforme a lo dispuesto por la Ley N.º 25.326 de Protección de los Datos Personales de la República Argentina.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Responsable del Tratamiento de los Datos</h2>
            <p>El responsable del tratamiento de los datos personales es TakeasyGO, plataforma tecnológica orientada a la digitalización y gestión de negocios gastronómicos.</p>
            <p className="mt-4">Nos encontramos en Buenos Aires, Ciudad Autónoma de Buenos Aires (CABA), Argentina.</p>
            <div className="mt-4">
              <strong>Medios de contacto:</strong>
              <ul className="list-none mt-2 space-y-2">
                <li><strong>Correo electrónico:</strong> <a href="mailto:hola@takeasygo.com" className="text-orange-600 hover:text-orange-700">hola@takeasygo.com</a></li>
                <li><strong>Teléfono / WhatsApp:</strong> +54 9 11 6001-9734</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Datos Personales que Podemos Recolectar</h2>
            <p>Dependiendo de la interacción con nuestra plataforma, podremos recolectar los siguientes datos:</p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>
                <strong>Datos de identificación:</strong> Nombre y apellido, Correo electrónico, Teléfono, Información de registro en la plataforma.
              </li>
              <li>
                <strong>Datos comerciales o de uso:</strong> Información relacionada con el uso de nuestra plataforma, Preferencias de configuración, Historial de operaciones realizadas dentro del sistema.
              </li>
              <li>
                <strong>Datos de facturación (cuando corresponda):</strong> CUIT/CUIL, Información necesaria para emitir comprobantes o facturación.
              </li>
            </ul>
            <p className="mt-4 font-medium">TakeasyGO no recopila datos sensibles de los usuarios como información médica, religiosa, política o biométrica.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Finalidades del Tratamiento de los Datos</h2>
            <p>Los datos personales recolectados serán utilizados para los siguientes fines:</p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li><strong>Prestación del servicio:</strong> Crear y administrar cuentas de usuario, Brindar acceso y funcionamiento a la plataforma, Gestionar operaciones relacionadas con el servicio.</li>
              <li><strong>Facturación y gestión administrativa:</strong> Emitir comprobantes, Gestionar pagos relacionados con el uso del servicio.</li>
              <li><strong>Comunicación con los usuarios:</strong> Enviar notificaciones relacionadas con el funcionamiento del servicio, Informar actualizaciones de la plataforma, Brindar soporte técnico.</li>
              <li><strong>Mejora del servicio:</strong> Analizar el uso de la plataforma para mejorar funcionalidades, rendimiento y experiencia del usuario.</li>
            </ul>
            <p className="mt-4 font-medium">TakeasyGO no utiliza sistemas de inteligencia artificial para el tratamiento automatizado de datos personales ni toma decisiones automatizadas basadas en perfiles de usuario.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Transferencia o Compartición de Datos</h2>
            <p>En determinados casos, los datos podrán ser compartidos con:</p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>Proveedores tecnológicos que prestan servicios de infraestructura (por ejemplo, hosting o almacenamiento en la nube).</li>
              <li>Autoridades regulatorias o fiscales, cuando exista obligación legal.</li>
            </ul>
            <p className="mt-4 font-medium">En ningún caso vendemos, alquilamos ni comercializamos datos personales a terceros.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Derechos del Titular de los Datos</h2>
            <p>De acuerdo con la Ley 25.326, usted tiene derecho a:</p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>Acceder a sus datos personales.</li>
              <li>Solicitar la rectificación de datos incorrectos o desactualizados.</li>
              <li>Solicitar la eliminación de sus datos cuando corresponda.</li>
              <li>Oponerse al tratamiento de sus datos en determinadas circunstancias.</li>
            </ul>
            <p className="mt-4">Para ejercer estos derechos puede contactarnos en <a href="mailto:hola@takeasygo.com" className="text-orange-600 hover:text-orange-700">hola@takeasygo.com</a> o al +54 9 11 6001-9734.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Seguridad de los Datos</h2>
            <p>TakeasyGO implementa medidas técnicas y organizativas razonables para proteger la información de los usuarios frente a accesos no autorizados, pérdida, alteración o divulgación. Estas medidas incluyen:</p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>Sistemas de autenticación y control de acceso</li>
              <li>Protección de infraestructura tecnológica</li>
              <li>Monitoreo de seguridad de la plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Conservación de los Datos</h2>
            <p>Los datos personales serán conservados únicamente durante el tiempo necesario para:</p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>Brindar el servicio contratado</li>
              <li>Cumplir obligaciones legales o fiscales</li>
              <li>Resolver posibles conflictos o requerimientos regulatorios</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Cambios en este Aviso de Privacidad</h2>
            <p>TakeasyGO podrá actualizar este Aviso de Privacidad cuando sea necesario para reflejar cambios en la legislación o en el funcionamiento del servicio. Las actualizaciones estarán disponibles en el sitio web oficial: <a href="https://www.takeasygo.com" className="text-orange-600 hover:text-orange-700">www.takeasygo.com</a></p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">Contacto</h2>
            <p>Si tiene consultas, comentarios o reclamos relacionados con la privacidad o el tratamiento de sus datos personales, puede comunicarse con nosotros a través de:</p>
            <ul className="list-none mt-4 space-y-2">
              <li><strong>Correo electrónico:</strong> <a href="mailto:hola@takeasygo.com" className="text-orange-600 hover:text-orange-700">hola@takeasygo.com</a></li>
              <li><strong>Teléfono:</strong> +54 9 11 6001-9734</li>
            </ul>
          </section>

          <p className="pt-8 text-sm text-zinc-500">Última actualización: Marzo 2026</p>
        </div>
        
        <div className="mt-16 text-center">
          <a href="/" className="inline-block px-6 py-3 bg-zinc-900 text-white font-bold uppercase tracking-widest text-xs hover:bg-orange-500 transition-colors">
            Volver al inicio
          </a>
        </div>
      </main>
    </div>
  )
}
