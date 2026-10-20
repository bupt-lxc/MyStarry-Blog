export const CAPABILITIES = [
  {
    id: "fullstack",
    name: "全栈开发与项目落地",
    description: "把业务需求转化为可上线、可维护的产品。",
    keywords: ["需求与架构", "前后端开发", "部署运维"],
  },
  {
    id: "agents",
    name: "大模型应用与智能体",
    description: "让模型结合知识、工具和协作流程完成任务。",
    keywords: ["RAG", "工具调用", "多智能体编排"],
  },
  {
    id: "training-inference",
    name: "AI 训练与推理优化",
    description: "围绕模型效果、运行效率和算力适配进行优化。",
    keywords: ["安全对齐", "异构适配", "性能评测"],
  },
] as const;

export type CapabilityId = (typeof CAPABILITIES)[number]["id"];
