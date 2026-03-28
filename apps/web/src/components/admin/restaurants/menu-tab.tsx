"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Plus,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Edit,
  Trash2,
  Loader2,
  Leaf,
  Vegan,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  reorderMenuCategories,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  reorderMenuItems,
} from "@/app/actions/restaurants"
import type { MenuCategory, MenuItem } from "@/types/restaurant"
import { formatPrice, parsePrice } from "@/types/restaurant"

interface MenuTabProps {
  restaurantId: string
}

// Sortable Category Component
function SortableCategory({
  category,
  items,
  onEdit,
  onDelete,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onReorderItems,
}: {
  category: MenuCategory
  items: MenuItem[]
  onEdit: (category: MenuCategory) => void
  onDelete: (categoryId: string) => void
  onAddItem: (categoryId: string) => void
  onEditItem: (item: MenuItem) => void
  onDeleteItem: (itemId: string) => void
  onReorderItems: (categoryId: string, itemIds: string[]) => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)
      const newOrder = arrayMove(items, oldIndex, newIndex)
      onReorderItems(
        category.id,
        newOrder.map((item) => item.id)
      )
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="bg-card border border-border rounded-[10px]">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 text-left">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">{category.name}</span>
              <span className="text-sm text-muted-foreground">
                ({items.length} {items.length === 1 ? "Gericht" : "Gerichte"})
              </span>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onEdit(category)}>
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Kategorie löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die Kategorie und alle zugehörigen Gerichte werden gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(category.id)}>
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <CollapsibleContent>
          <div className="p-4 space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableMenuItem
                    key={item.id}
                    item={item}
                    onEdit={onEditItem}
                    onDelete={onDeleteItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => onAddItem(category.id)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Gericht hinzufügen
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// Sortable Menu Item Component
function SortableMenuItem({
  item,
  onEdit,
  onDelete,
}: {
  item: MenuItem
  onEdit: (item: MenuItem) => void
  onDelete: (itemId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-muted rounded-[8px] hover:bg-accent transition-colors ${
        !item.is_available ? "opacity-50" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{item.name}</span>
          {item.is_vegetarian && (
            <span title="Vegetarisch">
              <Leaf className="h-3.5 w-3.5 text-green-600" />
            </span>
          )}
          {item.is_vegan && (
            <span title="Vegan">
              <Vegan className="h-3.5 w-3.5 text-green-700" />
            </span>
          )}
          {!item.is_available && (
            <span className="text-xs text-red-500">(Nicht verfügbar)</span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {item.description}
          </p>
        )}
      </div>
      <span className="text-sm font-medium whitespace-nowrap">
        {formatPrice(item.price)}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gericht löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Das Gericht wird dauerhaft gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(item.id)}>
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export function MenuTab({ restaurantId }: MenuTabProps) {
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])

  // Category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null)
  const [categoryName, setCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)

  // Item dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [itemCategoryId, setItemCategoryId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    price: "",
    is_vegetarian: false,
    is_vegan: false,
    is_available: true,
  })
  const [savingItem, setSavingItem] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient()

      const [categoriesRes, itemsRes] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("sort_order", { ascending: true }),
      ])

      if (categoriesRes.error) throw categoriesRes.error
      if (itemsRes.error) throw itemsRes.error

      setCategories(categoriesRes.data || [])
      setItems(itemsRes.data || [])
    } catch (error) {
      console.error("Error fetching menu data:", error)
      toast.error("Fehler beim Laden der Speisekarte")
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Category handlers
  const handleAddCategory = () => {
    setEditingCategory(null)
    setCategoryName("")
    setCategoryDialogOpen(true)
  }

  const handleEditCategory = (category: MenuCategory) => {
    setEditingCategory(category)
    setCategoryName(category.name)
    setCategoryDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    setSavingCategory(true)

    if (editingCategory) {
      const result = await updateMenuCategory({
        id: editingCategory.id,
        name: categoryName,
      })
      if (result.success) {
        toast.success("Kategorie aktualisiert")
        fetchData()
      } else {
        toast.error(result.error)
      }
    } else {
      const result = await createMenuCategory({
        restaurant_id: restaurantId,
        name: categoryName,
      })
      if (result.success) {
        toast.success("Kategorie erstellt")
        fetchData()
      } else {
        toast.error(result.error)
      }
    }

    setSavingCategory(false)
    setCategoryDialogOpen(false)
  }

  const handleDeleteCategory = async (categoryId: string) => {
    const result = await deleteMenuCategory(categoryId, restaurantId)
    if (result.success) {
      toast.success("Kategorie gelöscht")
      fetchData()
    } else {
      toast.error(result.error)
    }
  }

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((cat) => cat.id === active.id)
      const newIndex = categories.findIndex((cat) => cat.id === over.id)
      const newOrder = arrayMove(categories, oldIndex, newIndex)
      setCategories(newOrder)

      const result = await reorderMenuCategories(
        restaurantId,
        newOrder.map((cat) => cat.id)
      )
      if (!result.success) {
        toast.error(result.error)
        fetchData()
      }
    }
  }

  // Item handlers
  const handleAddItem = (categoryId: string) => {
    setEditingItem(null)
    setItemCategoryId(categoryId)
    setItemForm({
      name: "",
      description: "",
      price: "",
      is_vegetarian: false,
      is_vegan: false,
      is_available: true,
    })
    setItemDialogOpen(true)
  }

  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item)
    setItemCategoryId(item.category_id)
    setItemForm({
      name: item.name,
      description: item.description || "",
      price: item.price.toString().replace(".", ","),
      is_vegetarian: item.is_vegetarian,
      is_vegan: item.is_vegan,
      is_available: item.is_available,
    })
    setItemDialogOpen(true)
  }

  const handleSaveItem = async () => {
    if (!itemForm.name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    if (!itemForm.price.trim()) {
      toast.error("Bitte geben Sie einen Preis ein")
      return
    }

    const price = parsePrice(itemForm.price)
    if (isNaN(price) || price < 0) {
      toast.error("Bitte geben Sie einen gültigen Preis ein")
      return
    }

    setSavingItem(true)

    if (editingItem) {
      const result = await updateMenuItem({
        id: editingItem.id,
        name: itemForm.name,
        description: itemForm.description || null,
        price,
        is_vegetarian: itemForm.is_vegetarian,
        is_vegan: itemForm.is_vegan,
        is_available: itemForm.is_available,
      })
      if (result.success) {
        toast.success("Gericht aktualisiert")
        fetchData()
      } else {
        toast.error(result.error)
      }
    } else {
      const result = await createMenuItem({
        restaurant_id: restaurantId,
        category_id: itemCategoryId || undefined,
        name: itemForm.name,
        description: itemForm.description || undefined,
        price,
        is_vegetarian: itemForm.is_vegetarian,
        is_vegan: itemForm.is_vegan,
        is_available: itemForm.is_available,
      })
      if (result.success) {
        toast.success("Gericht hinzugefügt")
        fetchData()
      } else {
        toast.error(result.error)
      }
    }

    setSavingItem(false)
    setItemDialogOpen(false)
  }

  const handleDeleteItem = async (itemId: string) => {
    const result = await deleteMenuItem(itemId, restaurantId)
    if (result.success) {
      toast.success("Gericht gelöscht")
      fetchData()
    } else {
      toast.error(result.error)
    }
  }

  const handleReorderItems = async (categoryId: string, itemIds: string[]) => {
    const categoryItems = items.filter((item) => item.category_id === categoryId)
    const newOrder = itemIds.map((id) => categoryItems.find((item) => item.id === id)!)

    setItems((prev) => {
      const otherItems = prev.filter((item) => item.category_id !== categoryId)
      return [...otherItems, ...newOrder]
    })

    const result = await reorderMenuItems(restaurantId, categoryId, itemIds)
    if (!result.success) {
      toast.error(result.error)
      fetchData()
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const getItemsForCategory = (categoryId: string) =>
    items.filter((item) => item.category_id === categoryId)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Speisekarte</h2>
        <Button onClick={handleAddCategory}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Kategorie
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-[10px]">
          <p className="text-muted-foreground mb-4">
            Keine Kategorien vorhanden. Erstellen Sie Ihre erste Kategorie.
          </p>
          <Button onClick={handleAddCategory}>
            <Plus className="h-4 w-4 mr-2" />
            Erste Kategorie erstellen
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleCategoryDragEnd}
        >
          <SortableContext
            items={categories.map((cat) => cat.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {categories.map((category) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  items={getItemsForCategory(category.id)}
                  onEdit={handleEditCategory}
                  onDelete={handleDeleteCategory}
                  onAddItem={handleAddItem}
                  onEditItem={handleEditItem}
                  onDeleteItem={handleDeleteItem}
                  onReorderItems={handleReorderItems}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Kategorie bearbeiten" : "Neue Kategorie"}
            </DialogTitle>
            <DialogDescription>
              Geben Sie den Namen der Kategorie ein (z.B. Vorspeisen, Hauptgerichte)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">Name</Label>
              <Input
                id="categoryName"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Kategoriename"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
              disabled={savingCategory}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSaveCategory} disabled={savingCategory}>
              {savingCategory && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Gericht bearbeiten" : "Neues Gericht"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Name *</Label>
              <Input
                id="itemName"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="Gerichtsname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemDescription">Beschreibung</Label>
              <Textarea
                id="itemDescription"
                value={itemForm.description}
                onChange={(e) =>
                  setItemForm({ ...itemForm, description: e.target.value })
                }
                placeholder="Kurze Beschreibung..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemPrice">Preis *</Label>
              <div className="relative">
                <Input
                  id="itemPrice"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  placeholder="12,90"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="h-4 w-4 text-green-600" />
                <Label htmlFor="itemVegetarian">Vegetarisch</Label>
              </div>
              <Switch
                id="itemVegetarian"
                checked={itemForm.is_vegetarian}
                onCheckedChange={(checked) =>
                  setItemForm({ ...itemForm, is_vegetarian: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Vegan className="h-4 w-4 text-green-700" />
                <Label htmlFor="itemVegan">Vegan</Label>
              </div>
              <Switch
                id="itemVegan"
                checked={itemForm.is_vegan}
                onCheckedChange={(checked) =>
                  setItemForm({ ...itemForm, is_vegan: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="itemAvailable">Verfügbar</Label>
              <Switch
                id="itemAvailable"
                checked={itemForm.is_available}
                onCheckedChange={(checked) =>
                  setItemForm({ ...itemForm, is_available: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
              disabled={savingItem}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSaveItem} disabled={savingItem}>
              {savingItem && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
