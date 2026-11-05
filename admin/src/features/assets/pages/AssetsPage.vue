<script setup lang="ts">
import { h, computed, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { NButton, NCard, NDataTable, NPopconfirm, NSelect, NTag, NUpload } from "naive-ui";
import type { DataTableColumns, UploadFileInfo } from "naive-ui";
import {
  bindSlot,
  deleteAsset,
  formatSize,
  listAssets,
  listSlots,
  unbindSlot,
  uploadAsset,
  type AssetItem,
  type SlotItem,
} from "@/api/assets";
import { createUploadQueue, uploadBatch } from "../upload-batch";

const message = useMessage();

const items = ref<AssetItem[]>([]);
const loading = ref(false);
// 进行中的上传文件数：>0 时按钮转圈并显示剩余计数，全部结算后归零
const uploading = ref(0);
const uploadCategory = ref<string>("misc");
const slots = ref<SlotItem[]>([]);
// 每个槽位当前在下拉里选中的素材 id（0 = 未选择）
const slotSel = ref<Record<string, number>>({});

const CATEGORY_OPTIONS = [
  { label: "吉祥物", value: "mascot" },
  { label: "头像", value: "avatar" },
  { label: "横幅", value: "banner" },
  { label: "其他", value: "misc" },
];
const CATEGORY_TEXT: Record<string, string> = {
  mascot: "吉祥物",
  avatar: "头像",
  banner: "横幅",
  misc: "其他",
};

async function load() {
  loading.value = true;
  try {
    items.value = await listAssets();
    slots.value = await listSlots();
    const sel: Record<string, number> = {};
    for (const s of slots.value) sel[s.slot] = s.asset?.id ?? 0;
    slotSel.value = sel;
  } catch (e: any) {
    message.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

const SLOT_NAME: Record<string, string> = {
  frog: "恐怖蛙",
  snail: "不行蜗",
  otter: "惊讶獭",
  rabbit: "垂耳兔",
  dino: "三角龙",
};

const SLOT_EMOJI: Record<string, string> = {
  frog: "🐸",
  snail: "🐌",
  otter: "🦦",
  rabbit: "🐰",
  dino: "🦖",
};

async function saveSlot(s: SlotItem) {
  const assetId = slotSel.value[s.slot] ?? 0;
  try {
    if (assetId === 0) {
      await unbindSlot(s.slot);
      message.success(`已解绑 ${SLOT_NAME[s.name] || s.slot}`);
    } else {
      await bindSlot(s.slot, assetId);
      message.success(`已绑定 ${SLOT_NAME[s.name] || s.slot}`);
    }
    load();
  } catch (e: any) {
    message.error(e?.message || "操作失败");
  }
}

onMounted(load);

// 多选上传：NUpload 只负责选文件（default-upload=false），编排交给 uploadBatch。
// @change 对累积列表逐文件触发：用 id 集合去重，createUploadQueue 把同一轮
// 连发的事件合并成一次 runBatch，汇总提示才是一条完整的「成功 x 个，失败 y 个」。
const pickedUids = new Set<string>();
const uploadQueue = createUploadQueue(runBatch);

function onUploadChange({ fileList }: { fileList: UploadFileInfo[] }) {
  const fresh = fileList.filter((f) => !pickedUids.has(f.id));
  fresh.forEach((f) => pickedUids.add(f.id));
  const files = fresh.map((f) => f.file).filter((f): f is File => !!f);
  if (files.length === 0) return;
  uploadQueue.add(files);
}

async function runBatch(files: File[]) {
  uploading.value += files.length;
  try {
    const result = await uploadBatch(
      files,
      uploadCategory.value,
      uploadAsset,
      (name, ok, error) => {
        uploading.value = Math.max(0, uploading.value - 1);
        if (ok) message.success(`已上传：${name}`);
        else message.error(`${name}：${error || "上传失败"}`);
      },
    );
    if (result.failed.length === 0 && result.succeeded.length > 0) {
      message.success(`全部完成，共 ${result.succeeded.length} 个`);
    } else if (result.failed.length > 0) {
      message.warning(`批量上传结束：成功 ${result.succeeded.length} 个，失败 ${result.failed.length} 个`);
    }
    load();
  } catch (e: any) {
    message.error(e?.message || "批量上传失败");
  }
}

async function copyUrl(item: AssetItem) {
  try {
    await navigator.clipboard.writeText(item.url);
    message.success("链接已复制");
  } catch {
    message.error("复制失败：请手动复制 " + item.url);
  }
}

async function remove(item: AssetItem) {
  try {
    await deleteAsset(item.id);
    message.success("已删除");
    load();
  } catch (e: any) {
    message.error(e?.message || "删除失败");
  }
}

// 槽位下拉可选项：全部素材（上传时选对分类即可，不在此强限）
const itemOptions = computed(() => [
  { label: "（未绑定）", value: 0 },
  ...items.value.map((a) => ({ label: `${a.filename} · ${CATEGORY_TEXT[a.category] || a.category}`, value: a.id })),
]);

const columns: DataTableColumns<AssetItem> = [
  {
    title: "预览",
    key: "url",
    width: 72,
    render(row) {
      return h("img", {
        src: row.url,
        style:
          "width:44px;height:44px;object-fit:cover;border-radius:8px;background:var(--well);display:block",
      });
    },
  },
  {
    title: "文件",
    key: "filename",
    render(row) {
      return h("div", [
        h("div", { style: "font-weight:600" }, row.filename),
        h("div", { style: "font-size:12px;color:var(--ink3)" }, row.key),
      ]);
    },
  },
  {
    title: "分类",
    key: "category",
    width: 90,
    render(row) {
      return h(NTag, { size: "small", bordered: false }, { default: () => CATEGORY_TEXT[row.category] || row.category });
    },
  },
  { title: "大小", key: "size", width: 90, render: (row) => formatSize(row.size) },
  { title: "上传人", key: "uploaded_by", width: 100 },
  { title: "时间", key: "created_at", width: 170 },
  {
    title: "操作",
    key: "actions",
    width: 170,
    render(row) {
      return h("div", { style: "display:flex;gap:6px" }, [
        h(
          NButton,
          { size: "tiny", secondary: true, onClick: () => copyUrl(row) },
          { default: () => "复制链接" }
        ),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row) },
          {
            trigger: () =>
              h(
                NButton,
                { size: "tiny", quaternary: true, type: "error" },
                { default: () => "删除" }
              ),
            default: () => "删除后 App 端引用该素材的 URL 将失效，确认删除？",
          }
        ),
      ]);
    },
  },
];
</script>

<template>
  <div>
    <div class="toolbar">
      <span class="hint-text">删除会使已下发的 URL 失效</span>
      <span class="spacer" />
      <span class="upload-cat-label">上传分类</span>
      <NSelect
        v-model:value="uploadCategory"
        :options="CATEGORY_OPTIONS"
        size="small"
        style="width: 120px"
      />
      <NUpload
        multiple
        :default-upload="false"
        :show-file-list="false"
        accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
        style="width: auto"
        @change="onUploadChange"
      >
        <NButton type="primary" size="small" :loading="uploading > 0">
          上传素材{{ uploading > 0 ? `（${uploading}）` : "" }}
        </NButton>
      </NUpload>
    </div>

    <NCard size="small" title="吉祥物资源位" class="slotcard">
      <template #header-extra>
        <span class="slot-hint">App 按槽位 key 取图，绑定后即时生效</span>
      </template>
      <div class="slotgrid">
        <div v-for="s in slots" :key="s.slot" class="slotitem">
          <div class="slotitem__thumb" :class="{ 'slotitem__thumb--empty': !s.asset }">
            <img v-if="s.asset" :src="s.asset.url" alt="" />
            <span v-else class="slotitem__emoji">{{ SLOT_EMOJI[s.name] || "🐾" }}</span>
          </div>
          <div class="slotitem__name">{{ SLOT_NAME[s.name] || s.slot }}</div>
          <div class="slotitem__key">{{ s.slot }}</div>
          <NSelect
            v-model:value="slotSel[s.slot]"
            :options="itemOptions"
            size="small"
            placeholder="选择素材"
          />
          <NButton size="small" type="primary" secondary block @click="saveSlot(s)">应用</NButton>
        </div>
      </div>
      <p v-if="items.length === 0" class="empty" style="padding: 12px 0">
        先在下方上传素材，再回到这里绑定到槽位。
      </p>
    </NCard>

    <NCard size="small">
      <NDataTable :columns="columns" :data="items" :loading="loading" :bordered="false" size="small" />
      <p v-if="items.length === 0 && !loading" class="empty">还没有素材，点右上角上传。</p>
    </NCard>
  </div>
</template>

<style scoped>
.hint-text {
  color: var(--ink3);
  font-size: 12px;
}
.upload-cat-label {
  font-size: 13px;
  color: var(--ink2);
}
.slotcard {
  margin-bottom: 14px;
}
.slot-hint {
  font-size: 12px;
  color: var(--ink3);
  font-weight: 400;
}
.slotgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.slotitem {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: var(--well);
  text-align: center;
}
.slotitem__thumb {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid var(--line, #eee);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.slotitem__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.slotitem__thumb--empty {
  background: rgba(23, 27, 38, 0.04);
}
.slotitem__emoji {
  font-size: 30px;
  opacity: 0.45;
}
.slotitem__name {
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
}
.slotitem__key {
  font-size: 11px;
  color: var(--ink3);
  margin-bottom: 2px;
}
</style>
