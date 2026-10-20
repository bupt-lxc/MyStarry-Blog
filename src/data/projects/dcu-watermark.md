---
{
  "slug": "dcu-watermark",
  "title": "超算互联网｜海光 DCU 图像水印部署与优化",
  "context": "光合基金合作项目",
  "period": "2025.03—2025.09（主要开发期）",
  "summary": "将 NVIDIA GPU 上的图像水印模型迁移至海光 DCU，优化推理并完成平台软件交付。",
  "role": "模型适配、算子与推理优化、性能测试及交付",
  "outcomes": [
    {
      "id": "encoding-speed",
      "text": "1080p 编码 1.12 → 0.20 秒／图，提速 5.6 倍",
      "emphasis": "1.12 → 0.20 秒／图"
    },
    {
      "id": "project-award",
      "text": "2025 年 12 月获评光合基金优秀课题",
      "emphasis": "光合基金优秀课题"
    }
  ],
  "tags": [
    "Python",
    "TensorFlow",
    "DCU / DTK",
    "XLA",
    "容器部署"
  ],
  "order": 7,
  "links": [],
  "cover": "../../assets/projects/dcu-award.png",
  "coverAlt": "超算互联网｜海光 DCU 图像水印部署与优化项目截图",
  "primaryCapability": "training-inference",
  "secondaryEvidence": [],
  "card": {
    "contributions": [
      "迁移 TensorFlow 水印模型至海光 DCU／DTK",
      "以 XLA、批处理与异步加载优化推理并交付镜像"
    ],
    "primaryOutcomeId": "encoding-speed",
    "secondaryOutcomeId": "project-award",
    "tags": [
      "TensorFlow",
      "DCU / DTK",
      "XLA"
    ]
  }
}
---


## 项目背景

图像数字水印用于在不明显改变图像观感的情况下嵌入、提取版权标识。项目将原运行于 NVIDIA GPU 的深度学习水印模型迁移至国产海光 DCU，优化推理性能，并通过超算互联网平台提供使用，完成从模型适配到可交付软件的落地。


## 工作内容

我负责模型适配、运行环境部署、算子与推理优化，以及性能测试和软件交付。

- **完成国产算力适配**：基于 TensorFlow 与海光 DTK 环境迁移水印编解码模型，支持两种图像分辨率，验证迁移后的图像质量与水印提取正确性。

- **优化算子执行与推理流程**：启用 XLA 编译融合算子，减少核函数启动开销；结合批处理与异步数据加载，提高并行利用率，减少推理调用和数据等待。

- **交付平台服务**：完成软件封装、部署镜像与使用文档，镜像上架超算商城，并完成性能测试及三家单位的示范应用。


## 优化效果

移植优化测试中，**1080p 图像单 DCU 水印编码耗时由 1.12 秒／图降至 0.20 秒／图，加速 5.6 倍**。


## 成果与认可

项目通过验收，于 **2025 年 12 月获评“光合基金优秀课题”**。


## 核心技术

Python · TensorFlow · 海光 DCU／DTK · XLA · 批处理与异步加载 · 容器部署

![dcu-award.png](../../assets/projects/dcu-award.png)
