'use client'

interface MenuPreviewProps {
  cuisine: string
  primaryColor: string
}

export default function MenuPreview({ cuisine, primaryColor }: MenuPreviewProps) {
  // Static dummy data based on cuisine
  const items = cuisine.toLowerCase().includes('cafe') 
    ? [
        { name: 'Flat White', price: 2500, desc: 'Doble shot de espresso con leche texturada.' },
        { name: 'Avocado Toast', price: 4500, desc: 'Pan de masa madre, palta, huevo soft.' }
      ]
    : cuisine.toLowerCase().includes('hamburguesa')
    ? [
        { name: 'Cheeseburger', price: 6500, desc: 'Medallón 180g, doble cheddar, pan potato.' },
        { name: 'Papas Fritas', price: 2500, desc: 'Porción abundante de papas rústicas.' }
      ]
    : [
        { name: 'Plato Principal', price: 8000, desc: 'Elaborado con los mejores ingredientes.' },
        { name: 'Postre', price: 3000, desc: 'Para cerrar con algo dulce.' }
      ]

  return (
    <div className="max-w-md mx-auto bg-white h-full shadow-lg relative flex flex-col">
      {/* Header */}
      <div 
        className="h-32 bg-gray-200 relative flex items-end p-4"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="bg-white text-black font-bold text-xl px-4 py-2 rounded-md shadow">
          Logo
        </div>
      </div>
      
      {/* Search mock */}
      <div className="p-4 border-b">
        <div className="bg-gray-100 rounded-full h-10 w-full px-4 flex items-center text-gray-500">
          Buscar productos...
        </div>
      </div>

      {/* Categories mock */}
      <div className="flex px-4 py-3 space-x-3 overflow-x-auto border-b hide-scrollbar">
        <div className="px-4 py-1 rounded-full bg-black text-white text-sm whitespace-nowrap">Destacados</div>
        <div className="px-4 py-1 rounded-full border text-gray-700 text-sm whitespace-nowrap">Combos</div>
        <div className="px-4 py-1 rounded-full border text-gray-700 text-sm whitespace-nowrap">Bebidas</div>
      </div>

      {/* Items */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-start border-b pb-4">
            <div className="flex-1 pr-4">
              <h3 className="font-semibold text-gray-900">{item.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
              <div className="mt-2 font-medium">${item.price}</div>
            </div>
            <div className="w-24 h-24 bg-gray-100 rounded-md relative flex-shrink-0">
              {/* Image placeholder */}
              <div 
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                +
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Action Button (mock cart) */}
      <div className="absolute bottom-6 left-4 right-4 h-12 rounded-lg shadow-lg flex items-center justify-between px-4 text-white font-medium" style={{ backgroundColor: primaryColor }}>
        <div className="bg-white/20 px-2 py-1 rounded">2</div>
        <span>Ver pedido</span>
        <span>$ {items.reduce((acc, curr) => acc + curr.price, 0)}</span>
      </div>
    </div>
  )
}
