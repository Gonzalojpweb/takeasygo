const fs = require('fs');

const path = 'c:/Users/Gonzalo Palomo/Dropbox/Mi PC (LAPTOP-NVALH40I)/Desktop/takeasygo/components/admin/MenuManager.tsx';
let data = fs.readFileSync(path, 'utf8');

// 1. Add imports
data = data.replace(
  "import { useState, useRef } from 'react'",
  `import { useState, useRef, useEffect } from 'react'\nimport { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'\nimport { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'\nimport { CSS } from '@dnd-kit/utilities'\nimport { GripVertical } from 'lucide-react'`
);

// 2. Add handlers and state
const hookBlock = `
  const currentMenu = menus.find(m => m.locationId.toString() === selectedLocation)
  const currentLocation = locations.find(l => l._id === selectedLocation)

  const [localCategories, setLocalCategories] = useState<any[]>([])

  useEffect(() => {
    if (currentMenu?.categories) {
      setLocalCategories([...currentMenu.categories].sort((a: any, b: any) => a.sortOrder - b.sortOrder))
    } else {
      setLocalCategories([])
    }
  }, [currentMenu])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEndCategory(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalCategories((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id)
        const newIndex = items.findIndex((item) => item._id === over.id)
        const newArray = arrayMove(items, oldIndex, newIndex)
        
        // Optimistic API Call
        fetch(\`/api/\${tenantSlug}/menu/reorder\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: selectedLocation, type: 'categories', orderedIds: newArray.map(c => c._id) })
        }).then(res => { if(res.ok) router.refresh() })
        
        return newArray
      })
    }
  }

  function handleDragEndItem(categoryId: string, event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalCategories((cats) => {
        const newCats = [...cats]
        const catIndex = newCats.findIndex(c => c._id === categoryId)
        if (catIndex > -1) {
          const items = newCats[catIndex].items || []
          const oldIndex = items.findIndex((item: any) => item._id === active.id)
          const newIndex = items.findIndex((item: any) => item._id === over.id)
          const newItemsArray = arrayMove(items, oldIndex, newIndex)
          newCats[catIndex] = { ...newCats[catIndex], items: newItemsArray }
          
          // Optimistic API Call
          fetch(\`/api/\${tenantSlug}/menu/reorder\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationId: selectedLocation, type: 'items', categoryId, orderedIds: newItemsArray.map(i => i._id) })
          }).then(res => { if(res.ok) router.refresh() })
        }
        return newCats
      })
    }
  }
`;

data = data.replace(
  "  const currentMenu = menus.find(m => m.locationId.toString() === selectedLocation)\n  const currentLocation = locations.find(l => l._id === selectedLocation)",
  hookBlock
);

// 3. Wrap Categories mapped items
data = data.replace(
  /<div className="space-y-6">\s*\{currentMenu\.categories\s*\.sort\(\(a: any, b: any\) => a\.sortOrder - b\.sortOrder\)\s*\.map\(\(category: any\) => \{/g,
  `<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCategory}>
          <SortableContext items={localCategories.map(c => c._id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {localCategories.map((category: any) => {`
);

// Replace mapping Card with SortableCategoryWrapper
data = data.replace(
  /return \(\s*<Card\s*key=\{category\._id\}/g,
  `return (
                  <SortableCategoryWrapper key={category._id} id={category._id}>
                    <Card
                      `
);

// We need to close SortableCategoryWrapper after Card closes
// Let's find '</Card>\n              )\n            })}\n        </div>'
data = data.replace(
  /<\/Card>\s*\)\s*\}\)\}\s*<\/div>/g,
  `                    </Card>
                  </SortableCategoryWrapper>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>`
);

// 4. Wrap Category items mapped items
data = data.replace(
  /\{category\.items\.map\(\(item: any\) => \(/g,
  `<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndItem(category._id, e)}>
                              <SortableContext items={(category.items || []).map((i: any) => i._id)} strategy={verticalListSortingStrategy}>
                                {category.items.map((item: any) => (`
);

data = data.replace(
  /<\/motion\.div>\s*\)\)\}\s*<\/div>/g,
  `</motion.div>
                                ))}
                              </SortableContext>
                            </DndContext>
                          </div>`
);

// Inject SortableItemWrapper around motion.div? No, wait, if I just did `<SortableItemWrapper id={item._id} isEditing={editingItem === item._id}>`, I need to do it precisely.
data = data.replace(
  /<motion\.div\s*key=\{item\._id\}\s*layout(.*?)className=\{cn\(/gs,
  (match, p1) => `<SortableItemWrapper key={item._id} id={item._id} isEditing={editingItem === item._id}>
                                  <motion.div
                                    layout
                                    ${p1} className={cn(`
);

// Close SortableItemWrapper
data = data.replace(
  /<\/motion\.div>\s*\}\)\}\s*<\/SortableContext>\s*<\/DndContext>/g,
  `</motion.div>
                                  </SortableItemWrapper>
                                ))}
                              </SortableContext>
                            </DndContext>`
);

// Also need to use localCategories in places like: "currentMenu?.categories?.length" etc. We can just keep using currentMenu for counts because the count doesn't change, but localCategories is safer. Let's ignore it for now.
// Add Wrapper components at the bottom of the file
const wrappers = `
function SortableCategoryWrapper({ id, children }: { id: string, children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 relative">
      <div 
        {...attributes} 
        {...listeners} 
        className="mt-6 cursor-grab active:cursor-grabbing text-border hover:text-primary p-2 transition-colors touch-none"
      >
        <GripVertical size={24} />
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}

function SortableItemWrapper({ id, children, isEditing }: { id: string, children: React.ReactNode, isEditing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 relative group/item">
      {!isEditing && (
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing text-border opacity-50 hover:opacity-100 hover:text-primary p-2 transition-opacity touch-none"
        >
          <GripVertical size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}
`;

data += wrappers;

fs.writeFileSync(path, data);
console.log('Done replacing!');
