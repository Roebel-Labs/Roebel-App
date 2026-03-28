"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  Calendar,
  UtensilsCrossed,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
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
  createSpecialMenu,
  updateSpecialMenu,
  deleteSpecialMenu,
  createSpecialMenuCategory,
  updateSpecialMenuCategory,
  deleteSpecialMenuCategory,
  reorderSpecialMenuCategories,
  createSpecialMenuItem,
  updateSpecialMenuItem,
  deleteSpecialMenuItem,
  reorderSpecialMenuItems,
} from "@/app/actions/restaurants"
import type {
  SpecialMenu,
  SpecialMenuCategory,
  SpecialMenuItem,
  SpecialMenuStatus,
} from "@/types/restaurant"
import {
  formatPrice,
  parsePrice,
  formatDateRange,
  getSpecialMenuStatusBadge,
} from "@/types/restaurant"

interface SpecialMenusTabProps {
  restaurantId: string
}

// Sortable Category within Special Menu
function SortableSpecialCategory({
  category,
  items,
  onEdit,
  onDelete,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onReorderItems,
}: {
  category: SpecialMenuCategory
  items: SpecialMenuItem[]
  onEdit: (category: SpecialMenuCategory) => void
  onDelete: (categoryId: string) => void
  onAddItem: (categoryId: string) => void
  onEditItem: (item: SpecialMenuItem) => void
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
    <div ref={setNodeRef} style={style} className="border border-border rounded-[8px] bg-muted">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 text-left">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium text-sm">{category.name}</span>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onEdit(category)}>
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
                  <AlertDialogTitle>Kategorie löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die Kategorie und alle Gerichte werden gelöscht.
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
          <div className="p-3 space-y-2">
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
                  <SortableSpecialItem
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
              className="w-full"
              onClick={() => onAddItem(category.id)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Gericht
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// Sortable Special Menu Item
function SortableSpecialItem({
  item,
  onEdit,
  onDelete,
}: {
  item: SpecialMenuItem
  onEdit: (item: SpecialMenuItem) => void
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
      className="flex items-center gap-2 p-2 bg-card rounded-[6px] border border-border"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{item.name}</span>
          {item.is_vegetarian && (
            <span title="Vegetarisch">
              <Leaf className="h-3 w-3 text-green-600" />
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {item.description}
          </p>
        )}
      </div>
      {item.price && (
        <span className="text-xs font-medium">{formatPrice(item.price)}</span>
      )}
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(item)}>
        <Edit className="h-3 w-3" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
            <Trash2 className="h-3 w-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gericht löschen?</AlertDialogTitle>
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
  )
}

export function SpecialMenusTab({ restaurantId }: SpecialMenusTabProps) {
  const [loading, setLoading] = useState(true)
  const [specialMenus, setSpecialMenus] = useState<SpecialMenu[]>([])
  const [categories, setCategories] = useState<SpecialMenuCategory[]>([])
  const [items, setItems] = useState<SpecialMenuItem[]>([])

  // Expanded menu state
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null)

  // Special Menu dialog state
  const [menuDialogOpen, setMenuDialogOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<SpecialMenu | null>(null)
  const [menuForm, setMenuForm] = useState({
    name: "",
    description: "",
    cover_image_url: "",
    icon_image_url: "",
    price: "",
    start_date: "",
    end_date: "",
    status: "draft" as SpecialMenuStatus,
  })
  const [savingMenu, setSavingMenu] = useState(false)

  // Category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<SpecialMenuCategory | null>(null)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)

  // Item dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SpecialMenuItem | null>(null)
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null)
  const [currentItemMenuId, setCurrentItemMenuId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    price: "",
    is_vegetarian: false,
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

      const { data: menusData, error: menusError } = await supabase
        .from("special_menus")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true })

      if (menusError) throw menusError

      setSpecialMenus(menusData || [])

      // Fetch categories and items for all menus
      if (menusData && menusData.length > 0) {
        const menuIds = menusData.map((m) => m.id)

        const [categoriesRes, itemsRes] = await Promise.all([
          supabase
            .from("special_menu_categories")
            .select("*")
            .in("special_menu_id", menuIds)
            .order("sort_order", { ascending: true }),
          supabase
            .from("special_menu_items")
            .select("*")
            .in("special_menu_id", menuIds)
            .order("sort_order", { ascending: true }),
        ])

        if (categoriesRes.error) throw categoriesRes.error
        if (itemsRes.error) throw itemsRes.error

        setCategories(categoriesRes.data || [])
        setItems(itemsRes.data || [])
      }
    } catch (error) {
      console.error("Error fetching special menus:", error)
      toast.error("Fehler beim Laden der Spezialmenüs")
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Menu handlers
  const handleAddMenu = () => {
    setEditingMenu(null)
    setMenuForm({
      name: "",
      description: "",
      cover_image_url: "",
      icon_image_url: "",
      price: "",
      start_date: "",
      end_date: "",
      status: "draft",
    })
    setMenuDialogOpen(true)
  }

  const handleEditMenu = (menu: SpecialMenu) => {
    setEditingMenu(menu)
    setMenuForm({
      name: menu.name,
      description: menu.description || "",
      cover_image_url: menu.cover_image_url || "",
      icon_image_url: menu.icon_image_url || "",
      price: menu.price ? menu.price.toString().replace(".", ",") : "",
      start_date: menu.start_date || "",
      end_date: menu.end_date || "",
      status: menu.status,
    })
    setMenuDialogOpen(true)
  }

  const handleSaveMenu = async () => {
    if (!menuForm.name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    setSavingMenu(true)

    const price = menuForm.price ? parsePrice(menuForm.price) : null

    if (editingMenu) {
      const result = await updateSpecialMenu({
        id: editingMenu.id,
        name: menuForm.name,
        description: menuForm.description || null,
        cover_image_url: menuForm.cover_image_url || null,
        icon_image_url: menuForm.icon_image_url || null,
        price,
        start_date: menuForm.start_date || null,
        end_date: menuForm.end_date || null,
        status: menuForm.status,
      })
      if (result.success) {
        toast.success("Spezialmenü aktualisiert")
        fetchData()
      } else {
        toast.error(result.error)
      }
    } else {
      const result = await createSpecialMenu({
        restaurant_id: restaurantId,
        name: menuForm.name,
        description: menuForm.description || undefined,
        cover_image_url: menuForm.cover_image_url || undefined,
        icon_image_url: menuForm.icon_image_url || undefined,
        price: price || undefined,
        start_date: menuForm.start_date || undefined,
        end_date: menuForm.end_date || undefined,
        status: menuForm.status,
      })
      if (result.success) {
        toast.success("Spezialmenü erstellt")
        setExpandedMenuId(result.data?.id || null)
        fetchData()
      } else {
        toast.error(result.error)
      }
    }

    setSavingMenu(false)
    setMenuDialogOpen(false)
  }

  const handleDeleteMenu = async (menuId: string) => {
    const result = await deleteSpecialMenu(menuId, restaurantId)
    if (result.success) {
      toast.success("Spezialmenü gelöscht")
      fetchData()
    } else {
      toast.error(result.error)
    }
  }

  // Category handlers
  const handleAddCategory = (menuId: string) => {
    setEditingCategory(null)
    setCurrentMenuId(menuId)
    setCategoryName("")
    setCategoryDialogOpen(true)
  }

  const handleEditCategory = (category: SpecialMenuCategory) => {
    setEditingCategory(category)
    setCurrentMenuId(category.special_menu_id)
    setCategoryName(category.name)
    setCategoryDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!categoryName.trim() || !currentMenuId) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    setSavingCategory(true)

    if (editingCategory) {
      const result = await updateSpecialMenuCategory({
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
      const result = await createSpecialMenuCategory({
        special_menu_id: currentMenuId,
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
    const result = await deleteSpecialMenuCategory(categoryId)
    if (result.success) {
      toast.success("Kategorie gelöscht")
      fetchData()
    } else {
      toast.error(result.error)
    }
  }

  const handleReorderCategories = async (menuId: string, categoryIds: string[]) => {
    const menuCategories = categories.filter((c) => c.special_menu_id === menuId)
    const newOrder = categoryIds.map((id) => menuCategories.find((c) => c.id === id)!)

    setCategories((prev) => {
      const otherCategories = prev.filter((c) => c.special_menu_id !== menuId)
      return [...otherCategories, ...newOrder]
    })

    const result = await reorderSpecialMenuCategories(menuId, categoryIds)
    if (!result.success) {
      toast.error(result.error)
      fetchData()
    }
  }

  // Item handlers
  const handleAddItem = (categoryId: string, menuId: string) => {
    setEditingItem(null)
    setCurrentCategoryId(categoryId)
    setCurrentItemMenuId(menuId)
    setItemForm({
      name: "",
      description: "",
      price: "",
      is_vegetarian: false,
    })
    setItemDialogOpen(true)
  }

  const handleEditItem = (item: SpecialMenuItem) => {
    setEditingItem(item)
    setCurrentCategoryId(item.category_id)
    setCurrentItemMenuId(item.special_menu_id)
    setItemForm({
      name: item.name,
      description: item.description || "",
      price: item.price ? item.price.toString().replace(".", ",") : "",
      is_vegetarian: item.is_vegetarian,
    })
    setItemDialogOpen(true)
  }

  const handleSaveItem = async () => {
    if (!itemForm.name.trim() || !currentItemMenuId) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    setSavingItem(true)

    const price = itemForm.price ? parsePrice(itemForm.price) : null

    if (editingItem) {
      const result = await updateSpecialMenuItem({
        id: editingItem.id,
        name: itemForm.name,
        description: itemForm.description || null,
        price,
        is_vegetarian: itemForm.is_vegetarian,
      })
      if (result.success) {
        toast.success("Gericht aktualisiert")
        fetchData()
      } else {
        toast.error(result.error)
      }
    } else {
      const result = await createSpecialMenuItem({
        special_menu_id: currentItemMenuId,
        category_id: currentCategoryId || undefined,
        name: itemForm.name,
        description: itemForm.description || undefined,
        price: price || undefined,
        is_vegetarian: itemForm.is_vegetarian,
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
    const result = await deleteSpecialMenuItem(itemId)
    if (result.success) {
      toast.success("Gericht gelöscht")
      fetchData()
    } else {
      toast.error(result.error)
    }
  }

  const handleReorderItems = async (categoryId: string, itemIds: string[]) => {
    const categoryItems = items.filter((i) => i.category_id === categoryId)
    const newOrder = itemIds.map((id) => categoryItems.find((i) => i.id === id)!)

    setItems((prev) => {
      const otherItems = prev.filter((i) => i.category_id !== categoryId)
      return [...otherItems, ...newOrder]
    })

    const menu = categories.find((c) => c.id === categoryId)
    if (menu) {
      const result = await reorderSpecialMenuItems(menu.special_menu_id, categoryId, itemIds)
      if (!result.success) {
        toast.error(result.error)
        fetchData()
      }
    }
  }

  const handleCategoryDragEnd = (menuId: string) => (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const menuCategories = categories.filter((c) => c.special_menu_id === menuId)
      const oldIndex = menuCategories.findIndex((c) => c.id === active.id)
      const newIndex = menuCategories.findIndex((c) => c.id === over.id)
      const newOrder = arrayMove(menuCategories, oldIndex, newIndex)
      handleReorderCategories(
        menuId,
        newOrder.map((c) => c.id)
      )
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  const getCategoriesForMenu = (menuId: string) =>
    categories.filter((c) => c.special_menu_id === menuId)

  const getItemsForCategory = (categoryId: string) =>
    items.filter((i) => i.category_id === categoryId)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Spezialmenüs</h2>
        <Button onClick={handleAddMenu}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Spezialmenü
        </Button>
      </div>

      {specialMenus.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-[10px]">
          <UtensilsCrossed className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            Keine Spezialmenüs vorhanden.
          </p>
          <Button onClick={handleAddMenu}>
            <Plus className="h-4 w-4 mr-2" />
            Erstes Spezialmenü erstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {specialMenus.map((menu) => {
            const { label, className } = getSpecialMenuStatusBadge(menu.status)
            const menuCategories = getCategoriesForMenu(menu.id)
            const isExpanded = expandedMenuId === menu.id

            return (
              <div
                key={menu.id}
                className="bg-card border border-border rounded-[10px] overflow-hidden"
              >
                {/* Menu Header */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-lg">{menu.name}</h3>
                        <Badge className={className}>{label}</Badge>
                      </div>
                      {menu.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {menu.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {menu.price && (
                          <span className="font-medium">{formatPrice(menu.price)}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateRange(menu.start_date, menu.end_date)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEditMenu(menu)}>
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
                            <AlertDialogTitle>Spezialmenü löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Das Spezialmenü und alle Inhalte werden gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteMenu(menu.id)}>
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>

                {/* Menu Content */}
                <Collapsible
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedMenuId(open ? menu.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full p-3 text-sm text-center text-muted-foreground hover:bg-accent transition-colors flex items-center justify-center gap-2">
                      {isExpanded ? (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Inhalte ausblenden
                        </>
                      ) : (
                        <>
                          <ChevronRight className="h-4 w-4" />
                          Inhalte bearbeiten ({menuCategories.length} Kategorien)
                        </>
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-0 space-y-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddCategory(menu.id)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Kategorie hinzufügen
                      </Button>

                      {menuCategories.length > 0 && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleCategoryDragEnd(menu.id)}
                        >
                          <SortableContext
                            items={menuCategories.map((c) => c.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {menuCategories.map((category) => (
                                <SortableSpecialCategory
                                  key={category.id}
                                  category={category}
                                  items={getItemsForCategory(category.id)}
                                  onEdit={handleEditCategory}
                                  onDelete={handleDeleteCategory}
                                  onAddItem={(catId) => handleAddItem(catId, menu.id)}
                                  onEditItem={handleEditItem}
                                  onDeleteItem={handleDeleteItem}
                                  onReorderItems={handleReorderItems}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )
          })}
        </div>
      )}

      {/* Special Menu Sheet (Side Panel) */}
      <Sheet open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingMenu ? "Spezialmenü bearbeiten" : "Neues Spezialmenü"}
            </SheetTitle>
            <SheetDescription>
              Erstellen Sie ein Spezialmenü (z.B. Mittags Menü, Weihnachts Menü)
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Titelbild</Label>
              <ImageUploadDropzone
                onUploadComplete={(url) => setMenuForm(prev => ({ ...prev, cover_image_url: url }))}
                currentImageUrl={menuForm.cover_image_url}
                bucketName="news-images"
                maxSizeMB={5}
              />
            </div>
            <div className="space-y-2">
              <Label>Symbol/Icon</Label>
              <ImageUploadDropzone
                onUploadComplete={(url) => setMenuForm(prev => ({ ...prev, icon_image_url: url }))}
                currentImageUrl={menuForm.icon_image_url}
                bucketName="news-images"
                maxSizeMB={2}
              />
              <p className="text-xs text-muted-foreground">
                Kleines Symbol für die Menü-Übersicht (empfohlen: quadratisch)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="menuName">Name *</Label>
              <Input
                id="menuName"
                value={menuForm.name}
                onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                placeholder="z.B. Weihnachts Menü"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menuDescription">Beschreibung</Label>
              <Textarea
                id="menuDescription"
                value={menuForm.description}
                onChange={(e) =>
                  setMenuForm({ ...menuForm, description: e.target.value })
                }
                placeholder="Kurze Beschreibung..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menuPrice">Preis (optional)</Label>
              <div className="relative">
                <Input
                  id="menuPrice"
                  value={menuForm.price}
                  onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })}
                  placeholder="49,90"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="menuStartDate">Von</Label>
                <Input
                  id="menuStartDate"
                  type="date"
                  value={menuForm.start_date}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, start_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menuEndDate">Bis</Label>
                <Input
                  id="menuEndDate"
                  type="date"
                  value={menuForm.end_date}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="menuStatus">Status</Label>
              <Select
                value={menuForm.status}
                onValueChange={(value) =>
                  setMenuForm({ ...menuForm, status: value as SpecialMenuStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="published">Veröffentlicht</SelectItem>
                  <SelectItem value="archived">Archiviert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setMenuDialogOpen(false)}
              disabled={savingMenu}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSaveMenu} disabled={savingMenu}>
              {savingMenu && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Kategorie bearbeiten" : "Neue Kategorie"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="catName">Name</Label>
              <Input
                id="catName"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="z.B. Vorspeise, Hauptgang, Dessert"
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
              <Label htmlFor="itemDesc">Beschreibung</Label>
              <Textarea
                id="itemDesc"
                value={itemForm.description}
                onChange={(e) =>
                  setItemForm({ ...itemForm, description: e.target.value })
                }
                placeholder="Kurze Beschreibung..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemPrice">Preis (optional)</Label>
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
                <Label htmlFor="itemVeg">Vegetarisch</Label>
              </div>
              <Switch
                id="itemVeg"
                checked={itemForm.is_vegetarian}
                onCheckedChange={(checked) =>
                  setItemForm({ ...itemForm, is_vegetarian: checked })
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
