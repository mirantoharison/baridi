"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex gap-3 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:gap-6", className)}
      {...props}
    />
  )
}

/**
 * Horizontal : segmented control shadcn (pastille sur fond muted).
 * Vertical : variante « line » de shadcn — aucun fond, l'onglet actif est en gras avec un fin trait à droite.
 */
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex text-muted-foreground",
        "data-[orientation=horizontal]:h-9 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:items-center data-[orientation=horizontal]:justify-center data-[orientation=horizontal]:rounded-lg data-[orientation=horizontal]:bg-muted data-[orientation=horizontal]:p-[3px]",
        "data-[orientation=vertical]:h-fit data-[orientation=vertical]:w-44 data-[orientation=vertical]:shrink-0 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:gap-1",
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center gap-2 border border-transparent text-xs font-medium whitespace-nowrap text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg:not([class*='size-'])]:size-4",
        "data-[orientation=horizontal]:h-full data-[orientation=horizontal]:flex-1 data-[orientation=horizontal]:justify-center data-[orientation=horizontal]:rounded-md data-[orientation=horizontal]:px-3 data-[orientation=horizontal]:py-1.5 data-[orientation=horizontal]:data-active:bg-background data-[orientation=horizontal]:data-active:text-foreground data-[orientation=horizontal]:data-active:shadow-sm dark:data-[orientation=horizontal]:data-active:border-input dark:data-[orientation=horizontal]:data-active:bg-input/30",
        "relative data-[orientation=vertical]:justify-start data-[orientation=vertical]:gap-3 data-[orientation=vertical]:rounded-none data-[orientation=vertical]:px-3 data-[orientation=vertical]:py-2.5 data-[orientation=vertical]:data-active:font-semibold data-[orientation=vertical]:data-active:text-foreground data-[orientation=vertical]:after:absolute data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:right-0 data-[orientation=vertical]:after:w-0.5 data-[orientation=vertical]:after:bg-foreground data-[orientation=vertical]:after:opacity-0 data-[orientation=vertical]:after:transition-opacity data-[orientation=vertical]:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("min-w-0 flex-1 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
